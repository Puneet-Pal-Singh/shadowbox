/**
 * Cloud Sandbox Executor - Cloudflare Workers implementation
 * Manages remote sandboxes via Cloudflare Workers API
 *
 * SOLID:
 * - SRP: Only cloud sandbox lifecycle, not routing/policy/costing
 * - LSP: Fully substitutable for Executor interface
 */

import type {
  EnvironmentConfig,
  ExecutionEnvironment,
  ExecutionTask,
  ExecutionResult,
  ExecutionLog
} from '../../types/executor.js'
import { EnvironmentManager } from '../EnvironmentManager.js'

/**
 * API response schemas (validated at runtime)
 */
interface CloudSessionResponse {
  sessionId: string
  token: string
  expiresAt: number
}

interface CloudExecutionResponse {
  exitCode: number
  stdout: string
  stderr: string
  duration: number
  status: 'success' | 'error' | 'timeout'
}

interface CloudApiErrorPayload {
  error?: string
  code?: string
  details?: unknown
}

/**
 * Configuration for CloudSandboxExecutor
 */
export interface CloudSandboxExecutorConfig {
  /**
   * Cloudflare Workers API endpoint
   */
  apiUrl: string

  /**
   * Authentication token for API access
   */
  apiToken: string

  /**
   * Maximum retries for transient API failures
   */
  maxRetries?: number

  /**
   * Initial retry delay in milliseconds
   */
  retryDelayMs?: number
}

/**
 * Exponential backoff retry configuration
 */
interface RetryConfig {
  maxRetries: number
  initialDelayMs: number
}

// Timeout constants (in milliseconds)
const SESSION_CREATE_TIMEOUT = 30000 // 30 seconds
const TASK_EXEC_TIMEOUT = 60000 // 60 seconds
const POLL_TIMEOUT = 120000 // 120 seconds for polling
const LOG_STREAM_TIMEOUT = 10000 // 10 seconds per log request
const EXECUTION_NOT_IMPLEMENTED_CODE = 'EXECUTION_NOT_IMPLEMENTED'

class CloudApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'CloudApiError'
    this.status = status
    this.code = code
  }
}

/**
 * Cloud sandbox executor implementation
 * Executes tasks in remote Cloudflare Workers sandbox
 */
export class CloudSandboxExecutor extends EnvironmentManager {
  readonly name = 'Cloud Sandbox'
  private apiUrl: string
  private apiToken: string
  private retryConfig: RetryConfig

  constructor(config: CloudSandboxExecutorConfig) {
    super()
    this.validateConfig(config)
    this.apiUrl = config.apiUrl
    this.apiToken = config.apiToken
    this.retryConfig = {
      maxRetries: config.maxRetries ?? 3,
      initialDelayMs: config.retryDelayMs ?? 100
    }
  }

  async createEnvironment(config: EnvironmentConfig): Promise<ExecutionEnvironment> {
    try {
      const sessionResponse = await this.retryWithBackoff(() =>
        this.createSession(config)
      )

      console.log(
        `[executor/cloud] Created session: ${sessionResponse.sessionId.substring(0, 8)}...`
      )

      return {
        id: sessionResponse.sessionId,
        type: 'cloud',
        createdAt: Date.now(),
        metadata: {
          sessionId: sessionResponse.sessionId,
          token: sessionResponse.token,
          expiresAt: sessionResponse.expiresAt
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[executor/cloud] Failed to create session: ${msg}`)
      throw error
    }
  }

  protected async _executeImpl(
    env: ExecutionEnvironment,
    task: ExecutionTask
  ): Promise<ExecutionResult> {
    const sessionId = env.metadata?.sessionId
    const sessionToken = env.metadata?.token
    if (typeof sessionId !== 'string') {
      throw new Error('Session ID not found in environment metadata')
    }
    if (typeof sessionToken !== 'string') {
      throw new Error('Session token not found in environment metadata')
    }

    try {
      this.validateTask(task)

      const result = await this.retryWithBackoff(() =>
        this.executeTaskInCloud(sessionId, sessionToken, task)
      )

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: result.duration,
        timestamp: Date.now(),
        status: result.status
      }
    } catch (error) {
      const failure = this.buildExecutionFailure(error)
      return {
        exitCode: failure.exitCode,
        stdout: '',
        stderr: failure.stderr,
        duration: failure.duration,
        timestamp: Date.now(),
        status: 'error'
      }
    }
  }

  async streamLogs(env: ExecutionEnvironment): Promise<AsyncIterable<ExecutionLog>> {
    const sessionId = env.metadata?.sessionId as string
    const sessionToken = env.metadata?.token as string
    if (!sessionId) {
      throw new Error('Session ID not found in environment metadata')
    }
    if (!sessionToken) {
      throw new Error('Session token not found in environment metadata')
    }

    // Create self reference for use in async generator
    const self = this
    let lastFetchedTimestamp = 0

    return {
      async *[Symbol.asyncIterator]() {
        try {
          let lastLogTime = Date.now()

          // Stream logs for up to 2 minutes
          while (Date.now() - lastLogTime < POLL_TIMEOUT) {
            try {
              // Pass timestamp to avoid re-yielding duplicate logs
              const logs = await self.fetchLogsWithTimestamp(
                sessionId,
                sessionToken,
                lastFetchedTimestamp
              )
              if (logs.length > 0) {
                for (const log of logs) {
                  yield log
                  lastLogTime = Date.now()
                  lastFetchedTimestamp = Math.max(lastFetchedTimestamp, log.timestamp)
                }
              } else {
                // No new logs, wait before polling again
                await self.sleep(1000)
              }
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error)
              yield {
                timestamp: Date.now(),
                level: 'error',
                message: `Failed to fetch logs: ${msg}`
              }
              break
            }
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          yield {
            timestamp: Date.now(),
            level: 'error',
            message: `Log streaming failed: ${msg}`
          }
        }
      }
    }
  }

  async destroyEnvironment(env: ExecutionEnvironment): Promise<void> {
    const sessionId = env.metadata?.sessionId as string
    const sessionToken = env.metadata?.token as string
    if (!sessionId) {
      console.warn('[executor/cloud] Session ID not found in metadata')
      return
    }
    if (!sessionToken) {
      console.warn('[executor/cloud] Session token not found in metadata')
      return
    }

    try {
      await this.retryWithBackoff(() => this.deleteSession(sessionId, sessionToken))
      console.log(`[executor/cloud] Destroyed session: ${sessionId.substring(0, 8)}...`)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.warn(`[executor/cloud] Failed to destroy session: ${msg}`)
      // Don't throw — best effort cleanup
    }
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: CloudSandboxExecutorConfig): void {
    if (!config.apiUrl) {
      throw new Error('apiUrl is required')
    }
    if (!config.apiToken) {
      throw new Error('apiToken is required')
    }

    // Validate URL format
    try {
      const url = new URL(config.apiUrl)
      if (!url.protocol.startsWith('http')) {
        throw new Error()
      }
    } catch {
      throw new Error(`Invalid apiUrl: ${config.apiUrl}`)
    }
  }

  /**
   * Validate task inputs for safety
   * Note: Path validation happens at schema level (SessionAPI) for repoPath
   * This validates only critical fields required for execution
   */
  private validateTask(task: ExecutionTask): void {
    if (!task.command) {
      throw new Error('Task command is required')
    }

    if (!task.cwd) {
      throw new Error('Task cwd is required')
    }

    // Only check for path traversal (critical security issue)
    // Absolute paths are allowed in sandboxed contexts (/workspace is valid)
    if (task.cwd.includes('..')) {
      throw new Error('Path traversal not allowed: traversal sequences (..) not allowed')
    }

    // Reject Windows-style paths in Unix contexts
    if (task.cwd.includes('\\')) {
      throw new Error('Invalid path: backslashes not allowed')
    }
  }

  private normalizeCwdForApi(cwd: string): string {
    if (!cwd.startsWith('/')) {
      return cwd
    }
    const trimmed = cwd.replace(/^\/+/, '')
    return trimmed.length > 0 ? trimmed : '.'
  }

  /**
   * Create a remote session
   * @throws If session creation fails
   */
  private async createSession(config: EnvironmentConfig): Promise<CloudSessionResponse> {
    const url = `${this.apiUrl}/api/v1/session`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SESSION_CREATE_TIMEOUT)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          runId: config.runId,
          taskId: config.taskId,
          repoPath: config.repoPath
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        throw await this.parseApiError('Failed to create session', response)
      }

      const session = (await response.json()) as unknown
      return this.validateSessionResponse(session)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Execute task in remote session
   * @throws If execution fails
   */
  private async executeTaskInCloud(
    sessionId: string,
    sessionToken: string,
    task: ExecutionTask
  ): Promise<CloudExecutionResponse> {
    const url = `${this.apiUrl}/api/v1/execute`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TASK_EXEC_TIMEOUT)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          command: task.command,
          cwd: this.normalizeCwdForApi(task.cwd),
          timeout: task.timeout,
          env: task.env
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        throw await this.parseApiError('Failed to execute task', response)
      }

      const result = (await response.json()) as unknown
      return this.validateExecutionResponse(result)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Fetch logs from remote session with timestamp filter
   * @throws If log fetch fails
   */
  private async fetchLogsWithTimestamp(
    sessionId: string,
    sessionToken: string,
    since: number
  ): Promise<ExecutionLog[]> {
    const url = `${this.apiUrl}/api/v1/logs?sessionId=${encodeURIComponent(sessionId)}${since ? `&since=${since}` : ''}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), LOG_STREAM_TIMEOUT)

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        },
        signal: controller.signal
      })

      if (!response.ok) {
        throw await this.parseApiError('Failed to fetch logs', response)
      }

      // Handle both JSON and Server-Sent Events responses
      const contentType = response.headers.get('Content-Type') || ''
      if (contentType.includes('text/event-stream')) {
        return this.parseServerSentEvents(await response.text())
      }

      const data = (await response.json()) as unknown
      return this.validateLogsResponse(data)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Parse Server-Sent Events format logs
   * Handles multi-line data fields per SSE spec
   */
  private parseServerSentEvents(text: string): ExecutionLog[] {
    const logs: ExecutionLog[] = []
    const events = text.split('\n\n') // SSE events separated by double newline

    for (const event of events) {
      if (!event.trim()) continue

      const lines = event.split('\n')
      let dataContent = ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          // Accumulate data fields (can span multiple lines)
          dataContent += line.substring(6)
        }
      }

      if (dataContent) {
        try {
          const json = JSON.parse(dataContent)
          const validated = this.validateLogEntry(json)
          if (validated) {
            logs.push(validated)
          }
        } catch {
          // Skip invalid SSE entries
          continue
        }
      }
    }

    return logs
  }

  /**
   * Validate a single log entry
   * Returns null if invalid (for lenient parsing in SSE)
   */
  private validateLogEntry(item: unknown): ExecutionLog | null {
    return this.parseLogEntry(item, false)
  }

  /**
   * Parse and validate a log entry with configurable strictness
   * @param item - Log entry to validate
   * @param strict - If true, throws on invalid; if false, returns null
   */
  private parseLogEntry(item: unknown, strict: boolean): ExecutionLog | null {
    if (
      typeof item === 'object' &&
      item !== null &&
      'timestamp' in item &&
      'level' in item &&
      'message' in item
    ) {
      const log = item as Record<string, unknown>
      if (
        typeof log.timestamp === 'number' &&
        (log.level === 'info' || log.level === 'warn' || log.level === 'error' || log.level === 'debug') &&
        typeof log.message === 'string'
      ) {
        return {
          timestamp: log.timestamp,
          level: log.level as ExecutionLog['level'],
          message: log.message,
          source: log.source
        } as ExecutionLog
      }
    }
    if (strict) {
      throw new Error('Invalid log entry format')
    }
    return null
  }

  /**
   * Fetch logs from remote session (convenience method)
   * @deprecated Use fetchLogsWithTimestamp instead
   */
  private async fetchLogs(sessionId: string, sessionToken: string): Promise<ExecutionLog[]> {
    return this.fetchLogsWithTimestamp(sessionId, sessionToken, 0)
  }

  /**
   * Delete remote session
   * @throws If deletion fails
   */
  private async deleteSession(sessionId: string, sessionToken: string): Promise<void> {
    const url = `${this.apiUrl}/api/v1/session/${encodeURIComponent(sessionId)}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SESSION_CREATE_TIMEOUT)

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        },
        signal: controller.signal
      })

      if (!response.ok) {
        throw await this.parseApiError('Failed to delete session', response)
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Retry with exponential backoff
   * @throws If all retries exhausted
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    attemptNumber = 0
  ): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      if (!this.isRetryableError(error)) {
        throw error
      }

      if (attemptNumber >= this.retryConfig.maxRetries) {
        throw error
      }

      const delayMs = this.retryConfig.initialDelayMs * Math.pow(2, attemptNumber)
      await this.sleep(delayMs)

      return this.retryWithBackoff(fn, attemptNumber + 1)
    }
  }

  private buildExecutionFailure(error: unknown): { exitCode: number; stderr: string; duration: number } {
    if (error instanceof CloudApiError) {
      if (error.code === EXECUTION_NOT_IMPLEMENTED_CODE) {
        return {
          exitCode: 78,
          stderr: 'Remote runtime execution is not implemented',
          duration: 0
        }
      }
      return {
        exitCode: 1,
        stderr: `${error.code}: ${error.message}`,
        duration: 0
      }
    }

    const msg = error instanceof Error ? error.message : String(error)
    return { exitCode: 1, stderr: msg, duration: 0 }
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof CloudApiError) {
      return this.isRetryableStatus(error.status) && error.code !== EXECUTION_NOT_IMPLEMENTED_CODE
    }

    if (!(error instanceof Error)) {
      return false
    }

    const message = error.message
    const nonRetryablePatterns = [
      /401/,
      /403/,
      /404/,
      /400/,
      /422/,
      /501/,
      /Invalid session response format/,
      /Invalid execution response format/,
      /Invalid log entry format/,
      /Logs response must be an array/
    ]

    return !nonRetryablePatterns.some(pattern => pattern.test(message))
  }

  private isRetryableStatus(status: number): boolean {
    return status >= 500 && status !== 501
  }

  /**
   * Sleep for specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private async parseApiError(context: string, response: Response): Promise<CloudApiError> {
    const body = await this.parseApiErrorBody(response)
    const statusText = response.statusText || 'Unknown Error'
    const code = body.code || `HTTP_${response.status}`
    const statusLine = `${response.status} ${statusText}`
    const detail = body.error ? `: ${body.error}` : ''
    return new CloudApiError(response.status, code, `${context}: ${statusLine}${detail}`)
  }

  private async parseApiErrorBody(response: Response): Promise<{
    code?: string
    error?: string
  }> {
    try {
      const text = await response.text()
      if (!text) {
        return {}
      }
      const parsed = this.parseJsonErrorPayload(text)
      if (parsed) {
        return {
          code: parsed.code,
          error: this.scrubSensitiveText(parsed.error ?? '')
        }
      }
      return { error: this.scrubSensitiveText(text) }
    } catch {
      return {}
    }
  }

  private parseJsonErrorPayload(text: string): CloudApiErrorPayload | null {
    try {
      const payload = JSON.parse(text) as unknown
      if (!payload || typeof payload !== 'object') {
        return null
      }
      const asRecord = payload as Record<string, unknown>
      return {
        error: typeof asRecord.error === 'string' ? asRecord.error : undefined,
        code: typeof asRecord.code === 'string' ? asRecord.code : undefined,
        details: asRecord.details
      }
    } catch {
      return null
    }
  }

  private scrubSensitiveText(text: string): string {
    return text.replace(/[a-zA-Z0-9_-]{20,}/g, '[REDACTED]').substring(0, 200)
  }

  /**
   * Validate session response schema
   */
  private validateSessionResponse(data: unknown): CloudSessionResponse {
    if (
      typeof data === 'object' &&
      data !== null &&
      'sessionId' in data &&
      'token' in data &&
      'expiresAt' in data
    ) {
      const session = data as Record<string, unknown>
      if (
        typeof session.sessionId === 'string' &&
        typeof session.token === 'string' &&
        typeof session.expiresAt === 'number'
      ) {
        return {
          sessionId: session.sessionId,
          token: session.token,
          expiresAt: session.expiresAt
        }
      }
    }
    throw new Error('Invalid session response format')
  }

  /**
   * Validate execution response schema
   */
  private validateExecutionResponse(data: unknown): CloudExecutionResponse {
    if (
      typeof data === 'object' &&
      data !== null &&
      'exitCode' in data &&
      'stdout' in data &&
      'stderr' in data &&
      'duration' in data &&
      'status' in data
    ) {
      const result = data as Record<string, unknown>
      if (
        typeof result.exitCode === 'number' &&
        typeof result.stdout === 'string' &&
        typeof result.stderr === 'string' &&
        typeof result.duration === 'number' &&
        (result.status === 'success' || result.status === 'error' || result.status === 'timeout')
      ) {
        return {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          duration: result.duration,
          status: result.status as 'success' | 'error' | 'timeout'
        }
      }
    }
    throw new Error('Invalid execution response format')
  }

  /**
   * Validate logs response schema
   */
  private validateLogsResponse(data: unknown): ExecutionLog[] {
    if (!Array.isArray(data)) {
      throw new Error('Logs response must be an array')
    }

    // Use parseLogEntry with strict mode for array responses
    return data.map((item, index) => {
      const parsed = this.parseLogEntry(item, true)
      if (!parsed) {
        throw new Error(`Invalid log entry at index ${index}`)
      }
      return parsed
    })
  }
}
