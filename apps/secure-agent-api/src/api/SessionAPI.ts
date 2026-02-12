/**
 * Session API Handlers
 * HTTP endpoints for CloudSandboxExecutor integration
 *
 * SOLID:
 * - SRP: Each handler does one thing (create, execute, logs, delete)
 * - Dependency Injection: AgentRuntime passed as dependency
 */

import type { AgentRuntime } from '../core/AgentRuntime'

/**
 * Runtime can be either the actual AgentRuntime or a DurableObjectStub proxy
 * DurableObjectStub is dynamically typed by Cloudflare Workers
 */
type RuntimeStub = AgentRuntime | Record<string, unknown>
import {
  SessionCreateRequestSchema,
  SessionCreateResponseSchema,
  ExecuteTaskRequestSchema,
  ExecuteTaskResponseSchema,
  LogStreamQuerySchema,
  LogEntrySchema,
  DeleteSessionResponseSchema,
  validateRequestBody,
  validateQueryParams,
  jsonResponse,
  errorResponse,
  getPathParam
} from '../schemas/http-api'

/**
 * ⚠️  PRODUCTION SCALING NOTICE
 * 
 * In-memory session store is MVP only and will BREAK if secure-agent-api is:
 * - Deployed to multiple instances
 * - Behind a load balancer
 * - Running in auto-scaling group
 * - On Kubernetes with replicas > 1
 * 
 * PHASE 2.5B: Migrate to Durable Objects
 * [ ] Replace sessionStore Map with Durable Object storage
 * [ ] Replace logsStore Map with Durable Object storage
 * [ ] Add session recovery tests
 * [ ] Test with multiple instances
 * 
 * Key: sessionId, Value: { runId, taskId, repoPath, expiresAt, token }
 */
const sessionStore = new Map<
  string,
  {
    runId: string
    taskId: string
    repoPath: string
    expiresAt: number
    token: string
    createdAt: number
  }
>()

/**
 * Session logs store (temporary, replace with proper storage)
 * Key: sessionId, Value: array of log entries
 */
const logsStore = new Map<
  string,
  Array<{
    timestamp: number
    level: 'info' | 'warn' | 'error' | 'debug'
    message: string
    source?: 'stdout' | 'stderr'
  }>
>()

/**
 * Generate unique session ID using crypto-secure random
 */
function generateSessionId(): string {
  const randomBytes = new Uint8Array(8)
  crypto.getRandomValues(randomBytes)
  const randomHex = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `sess_${Date.now()}_${randomHex}`
}

/**
 * Generate cryptographically secure session token
 */
function generateToken(): string {
  const randomBytes = new Uint8Array(32)
  crypto.getRandomValues(randomBytes)
  const randomHex = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `tok_${randomHex}`
}

/**
 * Validate session exists and is not expired
 */
function validateSession(sessionId: string): boolean {
  const session = sessionStore.get(sessionId)
  if (!session) return false
  if (Date.now() > session.expiresAt) {
    sessionStore.delete(sessionId)
    return false
  }
  return true
}

/**
 * Store session in session store
 */
function storeSession(
  sessionId: string,
  runId: string,
  taskId: string,
  repoPath: string,
  token: string
): number {
  const expiresAt = Date.now() + 3600000 // 1 hour expiry
  sessionStore.set(sessionId, {
    runId,
    taskId,
    repoPath,
    expiresAt,
    token,
    createdAt: Date.now()
  })
  logsStore.set(sessionId, [])
  return expiresAt
}

/**
 * Fetch optional manifest from runtime
 */
function fetchManifest(runtime: RuntimeStub): unknown {
  try {
    const getManifest = (runtime as Record<string, unknown>).getManifest
    if (typeof getManifest === 'function') {
      return getManifest()
    }
    return undefined
  } catch (error) {
    console.warn('[api/session] Failed to get manifest:', error)
    return undefined
  }
}

/**
 * Build session response
 */
function buildSessionResponse(
  sessionId: string,
  token: string,
  expiresAt: number,
  manifest?: unknown
): Record<string, unknown> {
  const response: Record<string, unknown> = {
    sessionId,
    token,
    expiresAt
  }
  if (manifest) {
    response.manifest = manifest
  }
  return response
}

/**
 * POST /api/v1/session
 * Create a new execution session
 */
export async function handleCreateSession(
  request: Request,
  runtime: RuntimeStub
): Promise<Response> {
  console.log('[api/session] Handling session creation request')

  try {
    const validation = await validateRequestBody(request, SessionCreateRequestSchema)
    if (!validation.valid) {
      console.warn(`[api/session] Validation failed: ${validation.error}`)
      return errorResponse(validation.error, 'INVALID_REQUEST', 400)
    }

    const { runId, taskId, repoPath } = validation.data
    const sessionId = generateSessionId()
    const token = generateToken()
    const expiresAt = storeSession(sessionId, runId, taskId, repoPath, token)
    const manifest = fetchManifest(runtime)
    const response = buildSessionResponse(sessionId, token, expiresAt, manifest)

    console.log(`[api/session] Session created: ${sessionId.substring(0, 8)}...`)
    return jsonResponse(response, 201)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[api/session] Unexpected error: ${msg}`)
    return errorResponse(msg, 'INTERNAL_ERROR', 500)
  }
}

/**
 * Record execution log entry for a session
 */
function recordLog(
  sessionId: string,
  level: 'info' | 'error',
  message: string,
  source: 'stdout' | 'stderr'
): void {
  const logs = logsStore.get(sessionId) || []
  logs.push({
    timestamp: Date.now(),
    level,
    message,
    source
  })
  logsStore.set(sessionId, logs)
}

/**
 * Build successful execution response
 */
function buildSuccessResponse(duration: number): Record<string, unknown> {
  return {
    exitCode: 0,
    stdout: 'Command executed successfully',
    stderr: '',
    duration: Math.round(duration),
    status: 'success',
    timestamp: Date.now()
  }
}

/**
 * Build error execution response
 */
function buildErrorResponse(duration: number, message: string): Record<string, unknown> {
  return {
    exitCode: 1,
    stdout: '',
    stderr: message,
    duration: Math.round(duration),
    status: 'error',
    timestamp: Date.now()
  }
}

/**
 * POST /api/v1/execute
 * Execute a task in a session
 */
export async function handleExecuteTask(
  request: Request,
  runtime: RuntimeStub
): Promise<Response> {
  console.log('[api/execute] Handling task execution request')

  try {
    const validation = await validateRequestBody(request, ExecuteTaskRequestSchema)
    if (!validation.valid) {
      console.warn(`[api/execute] Validation failed: ${validation.error}`)
      return errorResponse(validation.error, 'INVALID_REQUEST', 400)
    }

    const { sessionId } = validation.data
    if (!validateSession(sessionId)) {
      console.warn(`[api/execute] Session not found or expired: ${sessionId}`)
      return errorResponse('Session not found or expired', 'SESSION_NOT_FOUND', 404)
    }

    const startTime = Date.now()
    try {
      // TODO: Phase 2.5B - Integrate actual runtime.run() execution
      // For MVP, this endpoint validates the contract and returns mock response
      // Real implementation will delegate to runtime.run(sessionId, command, cwd, timeout, env)
      const duration = Math.random() * 5000 // Random 0-5s
      recordLog(sessionId, 'info', 'Task executed successfully', 'stdout')
      console.log(`[api/execute] Task completed in ${Math.round(duration)}ms: ${sessionId.substring(0, 8)}...`)
      return jsonResponse(buildSuccessResponse(duration), 200)
    } catch (error) {
      const duration = Date.now() - startTime
      const msg = error instanceof Error ? error.message : String(error)
      recordLog(sessionId, 'error', msg, 'stderr')
      console.error(`[api/execute] Task failed: ${msg}`)
      return jsonResponse(buildErrorResponse(duration, msg), 200)
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[api/execute] Unexpected error: ${msg}`)
    return errorResponse(msg, 'INTERNAL_ERROR', 500)
  }
}

/**
 * GET /api/v1/logs?sessionId=...
 * Stream execution logs as Server-Sent Events
 */
export function handleStreamLogs(request: Request): Response {
  console.log('[api/logs] Handling log stream request')

  try {
    const url = new URL(request.url)

    // Validate query parameters
    const validation = validateQueryParams(url, LogStreamQuerySchema)

    if (!validation.valid) {
      console.warn(`[api/logs] Validation failed: ${validation.error}`)
      return errorResponse(validation.error, 'INVALID_REQUEST', 400)
    }

    const { sessionId, since } = validation.data

    // Validate session
    if (!validateSession(sessionId)) {
      console.warn(`[api/logs] Session not found: ${sessionId}`)
      return errorResponse('Session not found', 'SESSION_NOT_FOUND', 404)
    }

    // Get logs for session
    const allLogs = logsStore.get(sessionId) || []
    const filteredLogs = since
      ? allLogs.filter(log => log.timestamp > since)
      : allLogs

    console.log(`[api/logs] Streaming ${filteredLogs.length} logs for session: ${sessionId.substring(0, 8)}...`)

    // Format as Server-Sent Events
    const sseContent = filteredLogs
      .map(log => `data: ${JSON.stringify(log)}\n\n`)
      .join('')

    return new Response(sseContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[api/logs] Unexpected error: ${msg}`)
    return errorResponse(msg, 'INTERNAL_ERROR', 500)
  }
}

/**
 * DELETE /api/v1/session/:sessionId
 * Delete a session and clean up resources
 */
export function handleDeleteSession(request: Request): Response {
  console.log('[api/delete-session] Handling session deletion request')

  try {
    const url = new URL(request.url)

    // Extract sessionId from path: /api/v1/session/:sessionId
    const pathParts = url.pathname.split('/')
    const sessionId = pathParts[pathParts.length - 1]

    if (!sessionId || sessionId.length < 5) {
      console.warn(`[api/delete-session] Invalid session ID: ${sessionId}`)
      return errorResponse('Invalid session ID', 'INVALID_REQUEST', 400)
    }

    // Check if session exists
    const exists = sessionStore.has(sessionId)

    if (!exists) {
      console.warn(`[api/delete-session] Session not found: ${sessionId}`)
      return errorResponse('Session not found', 'SESSION_NOT_FOUND', 404)
    }

    // Delete session and logs
    sessionStore.delete(sessionId)
    logsStore.delete(sessionId)

    console.log(`[api/delete-session] Session deleted: ${sessionId.substring(0, 8)}...`)

    const response: Record<string, unknown> = {
      success: true,
      message: `Session ${sessionId} deleted successfully`
    }

    return jsonResponse(response, 200)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[api/delete-session] Unexpected error: ${msg}`)
    return errorResponse(msg, 'INTERNAL_ERROR', 500)
  }
}

/**
 * Add log entry to a session
 * Called internally by plugins to track execution logs
 */
export function addLog(
  sessionId: string,
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  source?: 'stdout' | 'stderr'
): void {
  const logs = logsStore.get(sessionId) || []
  logs.push({
    timestamp: Date.now(),
    level,
    message,
    source
  })
  logsStore.set(sessionId, logs)
}

/**
 * Get session info (for internal use)
 */
export function getSession(sessionId: string) {
  return sessionStore.get(sessionId)
}

/**
 * Check if session is valid
 */
export function isSessionValid(sessionId: string): boolean {
  return validateSession(sessionId)
}
