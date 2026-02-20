/**
 * Session API Handlers
 * HTTP endpoints for CloudSandboxExecutor integration
 */

import type { AgentRuntime } from "../core/AgentRuntime";
import {
  SessionCreateRequestSchema,
  ExecuteTaskRequestSchema,
  ExecuteTaskResponseSchema,
  LogStreamQuerySchema,
  validateRequestBody,
  validateQueryParams,
  jsonResponse,
  errorResponse,
  type ExecuteTaskRequest,
  type ExecuteTaskResponse,
} from "../schemas/http-api";

type RuntimeStub = AgentRuntime | Record<string, unknown>;

const SESSION_TTL_MS = 3600000;
const EXECUTION_NOT_IMPLEMENTED_CODE = "EXECUTION_NOT_IMPLEMENTED";

interface SessionRecord {
  runId: string;
  taskId: string;
  repoPath: string;
  expiresAt: number;
  token: string;
  createdAt: number;
}

interface SessionLogEntry {
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  source?: "stdout" | "stderr";
}

interface RuntimeExecuteTaskHandler {
  (request: ExecuteTaskRequest): Promise<unknown>;
}

const sessionStore = new Map<string, SessionRecord>();
const logsStore = new Map<string, SessionLogEntry[]>();

function generateSessionId(): string {
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sess_${Date.now()}_${randomHex}`;
}

function generateToken(): string {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `tok_${randomHex}`;
}

function storeSession(
  sessionId: string,
  runId: string,
  taskId: string,
  repoPath: string,
  token: string,
): number {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessionStore.set(sessionId, {
    runId,
    taskId,
    repoPath,
    expiresAt,
    token,
    createdAt: Date.now(),
  });
  logsStore.set(sessionId, []);
  return expiresAt;
}

function getActiveSession(sessionId: string): SessionRecord | null {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return null;
  }
  if (Date.now() > session.expiresAt) {
    sessionStore.delete(sessionId);
    logsStore.delete(sessionId);
    return null;
  }
  return session;
}

function parseBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return null;
  }
  const match = authHeader.match(/^Bearer (.+)$/);
  return match?.[1] ?? null;
}

function authorizeSessionRequest(
  request: Request,
  sessionId: string,
): { ok: true; session: SessionRecord } | { ok: false; response: Response } {
  const session = getActiveSession(sessionId);
  if (!session) {
    return {
      ok: false,
      response: errorResponse("Session not found or expired", "SESSION_NOT_FOUND", 404),
    };
  }

  const providedToken = parseBearerToken(request);
  if (!providedToken || providedToken !== session.token) {
    return {
      ok: false,
      response: errorResponse("Unauthorized", "UNAUTHORIZED", 401),
    };
  }

  return { ok: true, session };
}

function recordLog(
  sessionId: string,
  level: SessionLogEntry["level"],
  message: string,
  source?: SessionLogEntry["source"],
): void {
  const logs = logsStore.get(sessionId) || [];
  logs.push({
    timestamp: Date.now(),
    level,
    message,
    source,
  });
  logsStore.set(sessionId, logs);
}

async function fetchManifest(runtime: RuntimeStub): Promise<unknown> {
  try {
    const getManifest = (runtime as Record<string, unknown>).getManifest;
    if (typeof getManifest !== "function") {
      return undefined;
    }
    const result = getManifest();
    return result instanceof Promise ? await result : result;
  } catch (error) {
    console.warn("[api/session] Failed to get manifest:", error);
    return undefined;
  }
}

function getRuntimeExecuteTaskHandler(
  runtime: RuntimeStub,
): RuntimeExecuteTaskHandler | null {
  const candidate = (runtime as Record<string, unknown>).executeTask;
  return typeof candidate === "function"
    ? (candidate as RuntimeExecuteTaskHandler)
    : null;
}

function extractSessionIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/v1\/session\/(.+)$/);
  return match?.[1] ?? null;
}

function parseExecutionResponse(result: unknown): ExecuteTaskResponse | null {
  const parsed = ExecuteTaskResponseSchema.safeParse(result);
  return parsed.success ? parsed.data : null;
}

export async function handleCreateSession(
  request: Request,
  runtime: RuntimeStub,
): Promise<Response> {
  console.log("[api/session] Handling session creation request");

  try {
    const validation = await validateRequestBody(request, SessionCreateRequestSchema);
    if (!validation.valid) {
      console.warn(`[api/session] Validation failed: ${validation.error}`);
      return errorResponse(validation.error, "INVALID_REQUEST", 400);
    }

    const { runId, taskId, repoPath } = validation.data;
    const sessionId = generateSessionId();
    const token = generateToken();
    const expiresAt = storeSession(sessionId, runId, taskId, repoPath, token);
    const manifest = await fetchManifest(runtime);

    const response: Record<string, unknown> = {
      sessionId,
      token,
      expiresAt,
    };
    if (manifest) {
      response.manifest = manifest;
    }

    console.log(`[api/session] Session created: ${sessionId.substring(0, 8)}...`);
    return jsonResponse(response, 201);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[api/session] Unexpected error: ${msg}`);
    return errorResponse(msg, "INTERNAL_ERROR", 500);
  }
}

export async function handleExecuteTask(
  request: Request,
  runtime: RuntimeStub,
): Promise<Response> {
  console.log("[api/execute] Handling task execution request");

  try {
    const validation = await validateRequestBody(request, ExecuteTaskRequestSchema);
    if (!validation.valid) {
      console.warn(`[api/execute] Validation failed: ${validation.error}`);
      return errorResponse(validation.error, "INVALID_REQUEST", 400);
    }

    const { sessionId } = validation.data;
    const auth = authorizeSessionRequest(request, sessionId);
    if (!auth.ok) {
      return auth.response;
    }

    const executeTask = getRuntimeExecuteTaskHandler(runtime);
    if (!executeTask) {
      recordLog(
        sessionId,
        "warn",
        "Execution endpoint called but runtime task execution is not implemented",
        "stderr",
      );
      return errorResponse(
        "Runtime execution is not implemented on this deployment",
        EXECUTION_NOT_IMPLEMENTED_CODE,
        501,
      );
    }

    const runtimeResult = await executeTask(validation.data);
    const executionResult = parseExecutionResponse(runtimeResult);
    if (!executionResult) {
      return errorResponse(
        "Runtime returned an invalid execution response",
        "INVALID_RUNTIME_RESPONSE",
        502,
      );
    }

    recordLog(
      sessionId,
      executionResult.exitCode === 0 ? "info" : "error",
      executionResult.exitCode === 0
        ? "Task executed successfully"
        : executionResult.stderr || "Task failed",
      executionResult.exitCode === 0 ? "stdout" : "stderr",
    );

    return jsonResponse(executionResult, 200);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[api/execute] Unexpected error: ${msg}`);
    return errorResponse(msg, "INTERNAL_ERROR", 500);
  }
}

export function handleStreamLogs(request: Request): Response {
  console.log("[api/logs] Handling log stream request");

  try {
    const url = new URL(request.url);
    const validation = validateQueryParams(url, LogStreamQuerySchema);
    if (!validation.valid) {
      console.warn(`[api/logs] Validation failed: ${validation.error}`);
      return errorResponse(validation.error, "INVALID_REQUEST", 400);
    }

    const { sessionId, since } = validation.data;
    const auth = authorizeSessionRequest(request, sessionId);
    if (!auth.ok) {
      return auth.response;
    }

    const allLogs = logsStore.get(sessionId) || [];
    const filteredLogs = since
      ? allLogs.filter((log) => log.timestamp > since)
      : allLogs;

    console.log(
      `[api/logs] Streaming ${filteredLogs.length} logs for session: ${sessionId.substring(0, 8)}...`,
    );

    const sseContent = filteredLogs
      .map((log) => `data: ${JSON.stringify(log)}\n\n`)
      .join("");

    return new Response(sseContent, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[api/logs] Unexpected error: ${msg}`);
    return errorResponse(msg, "INTERNAL_ERROR", 500);
  }
}

export function handleDeleteSession(request: Request): Response {
  console.log("[api/delete-session] Handling session deletion request");

  try {
    const url = new URL(request.url);
    const sessionId = extractSessionIdFromPath(url.pathname);
    if (!sessionId || sessionId.length < 5) {
      console.warn(`[api/delete-session] Invalid session ID: ${sessionId}`);
      return errorResponse("Invalid session ID", "INVALID_REQUEST", 400);
    }

    const auth = authorizeSessionRequest(request, sessionId);
    if (!auth.ok) {
      return auth.response;
    }

    sessionStore.delete(sessionId);
    logsStore.delete(sessionId);
    console.log(`[api/delete-session] Session deleted: ${sessionId.substring(0, 8)}...`);

    return jsonResponse(
      {
        success: true,
        message: `Session ${sessionId} deleted successfully`,
      },
      200,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[api/delete-session] Unexpected error: ${msg}`);
    return errorResponse(msg, "INTERNAL_ERROR", 500);
  }
}

export function addLog(
  sessionId: string,
  level: SessionLogEntry["level"],
  message: string,
  source?: SessionLogEntry["source"],
): void {
  recordLog(sessionId, level, message, source);
}

export function getSession(sessionId: string): SessionRecord | null {
  return getActiveSession(sessionId);
}

export function isSessionValid(sessionId: string): boolean {
  return getActiveSession(sessionId) !== null;
}
