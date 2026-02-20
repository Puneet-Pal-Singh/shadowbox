/**
 * Session API Handlers
 * HTTP endpoints for CloudSandboxExecutor integration
 */

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

type RuntimeStub = Record<string, unknown>;

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

interface PublicSessionRecord {
  runId: string;
  taskId: string;
  repoPath: string;
  expiresAt: number;
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

interface RuntimeSessionStore {
  storeExecutionSession: (
    sessionId: string,
    session: SessionRecord,
  ) => Promise<void>;
  getExecutionSession: (sessionId: string) => Promise<SessionRecord | null>;
  appendExecutionLog: (
    sessionId: string,
    entry: SessionLogEntry,
  ) => Promise<void>;
  getExecutionLogs: (
    sessionId: string,
    since?: number,
  ) => Promise<SessionLogEntry[]>;
  deleteExecutionSession: (sessionId: string) => Promise<void>;
}

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

function parseBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return null;
  }
  const match = authHeader.match(/^Bearer (.+)$/);
  return match?.[1] ?? null;
}

function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i]! ^ bBytes[i]!;
  }
  return diff === 0;
}

function getRuntimeSessionStore(runtime: RuntimeStub): RuntimeSessionStore | null {
  const candidate = runtime as Record<string, unknown>;
  const storeExecutionSession = candidate.storeExecutionSession;
  const getExecutionSession = candidate.getExecutionSession;
  const appendExecutionLog = candidate.appendExecutionLog;
  const getExecutionLogs = candidate.getExecutionLogs;
  const deleteExecutionSession = candidate.deleteExecutionSession;

  if (
    typeof storeExecutionSession !== "function" ||
    typeof getExecutionSession !== "function" ||
    typeof appendExecutionLog !== "function" ||
    typeof getExecutionLogs !== "function" ||
    typeof deleteExecutionSession !== "function"
  ) {
    return null;
  }

  return {
    storeExecutionSession:
      storeExecutionSession as RuntimeSessionStore["storeExecutionSession"],
    getExecutionSession:
      getExecutionSession as RuntimeSessionStore["getExecutionSession"],
    appendExecutionLog:
      appendExecutionLog as RuntimeSessionStore["appendExecutionLog"],
    getExecutionLogs: getExecutionLogs as RuntimeSessionStore["getExecutionLogs"],
    deleteExecutionSession:
      deleteExecutionSession as RuntimeSessionStore["deleteExecutionSession"],
  };
}

async function storeSession(
  runtime: RuntimeStub,
  sessionId: string,
  runId: string,
  taskId: string,
  repoPath: string,
  token: string,
): Promise<number> {
  const sessionStore = getRuntimeSessionStore(runtime);
  if (!sessionStore) {
    throw new Error("Session storage is unavailable");
  }

  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  await sessionStore.storeExecutionSession(sessionId, {
    runId,
    taskId,
    repoPath,
    expiresAt,
    token,
    createdAt: now,
  });
  return expiresAt;
}

async function getActiveSession(
  runtime: RuntimeStub,
  sessionId: string,
): Promise<SessionRecord | null> {
  const sessionStore = getRuntimeSessionStore(runtime);
  if (!sessionStore) {
    return null;
  }

  const session = await sessionStore.getExecutionSession(sessionId);
  if (!session) {
    return null;
  }

  if (Date.now() > session.expiresAt) {
    await sessionStore.deleteExecutionSession(sessionId);
    return null;
  }

  return session;
}

async function recordLog(
  runtime: RuntimeStub,
  sessionId: string,
  level: SessionLogEntry["level"],
  message: string,
  source?: SessionLogEntry["source"],
): Promise<void> {
  const sessionStore = getRuntimeSessionStore(runtime);
  if (!sessionStore) {
    return;
  }

  await sessionStore.appendExecutionLog(sessionId, {
    timestamp: Date.now(),
    level,
    message,
    source,
  });
}

async function authorizeSessionRequest(
  request: Request,
  runtime: RuntimeStub,
  sessionId: string,
): Promise<{ ok: true; session: SessionRecord } | { ok: false; response: Response }> {
  const session = await getActiveSession(runtime, sessionId);
  if (!session) {
    return {
      ok: false,
      response: errorResponse("Session not found or expired", "SESSION_NOT_FOUND", 404),
    };
  }

  const providedToken = parseBearerToken(request);
  if (!providedToken || !constantTimeEqual(providedToken, session.token)) {
    return {
      ok: false,
      response: errorResponse("Unauthorized", "UNAUTHORIZED", 401),
    };
  }

  return { ok: true, session };
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
    if (!getRuntimeSessionStore(runtime)) {
      return errorResponse(
        "Session storage unavailable",
        "SESSION_STORAGE_UNAVAILABLE",
        503,
      );
    }

    const validation = await validateRequestBody(request, SessionCreateRequestSchema);
    if (!validation.valid) {
      console.warn(`[api/session] Validation failed: ${validation.error}`);
      return errorResponse(validation.error, "INVALID_REQUEST", 400);
    }

    const { runId, taskId, repoPath } = validation.data;
    const sessionId = generateSessionId();
    const token = generateToken();
    const expiresAt = await storeSession(
      runtime,
      sessionId,
      runId,
      taskId,
      repoPath,
      token,
    );
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
    const auth = await authorizeSessionRequest(request, runtime, sessionId);
    if (!auth.ok) {
      return auth.response;
    }

    const executeTask = getRuntimeExecuteTaskHandler(runtime);
    if (!executeTask) {
      await recordLog(
        runtime,
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

    await recordLog(
      runtime,
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

export async function handleStreamLogs(
  request: Request,
  runtime: RuntimeStub,
  corsHeaders: Record<string, string> = {},
): Promise<Response> {
  console.log("[api/logs] Handling log stream request");

  try {
    const url = new URL(request.url);
    const validation = validateQueryParams(url, LogStreamQuerySchema);
    if (!validation.valid) {
      console.warn(`[api/logs] Validation failed: ${validation.error}`);
      return errorResponse(validation.error, "INVALID_REQUEST", 400);
    }

    const sessionStore = getRuntimeSessionStore(runtime);
    if (!sessionStore) {
      return errorResponse(
        "Session storage unavailable",
        "SESSION_STORAGE_UNAVAILABLE",
        503,
      );
    }

    const { sessionId, since } = validation.data;
    const auth = await authorizeSessionRequest(request, runtime, sessionId);
    if (!auth.ok) {
      return auth.response;
    }

    const logs = await sessionStore.getExecutionLogs(sessionId, since);
    console.log(
      `[api/logs] Streaming ${logs.length} logs for session: ${sessionId.substring(0, 8)}...`,
    );

    const sseContent = logs.map((log) => `data: ${JSON.stringify(log)}\n\n`).join("");

    return new Response(sseContent, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...corsHeaders,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[api/logs] Unexpected error: ${msg}`);
    return errorResponse(msg, "INTERNAL_ERROR", 500);
  }
}

export async function handleDeleteSession(
  request: Request,
  runtime: RuntimeStub,
): Promise<Response> {
  console.log("[api/delete-session] Handling session deletion request");

  try {
    const url = new URL(request.url);
    const sessionId = extractSessionIdFromPath(url.pathname);
    if (!sessionId || sessionId.length < 5) {
      console.warn(`[api/delete-session] Invalid session ID: ${sessionId}`);
      return errorResponse("Invalid session ID", "INVALID_REQUEST", 400);
    }

    const auth = await authorizeSessionRequest(request, runtime, sessionId);
    if (!auth.ok) {
      return auth.response;
    }

    const sessionStore = getRuntimeSessionStore(runtime);
    if (!sessionStore) {
      return errorResponse(
        "Session storage unavailable",
        "SESSION_STORAGE_UNAVAILABLE",
        503,
      );
    }

    await sessionStore.deleteExecutionSession(sessionId);
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

export async function addLog(
  runtime: RuntimeStub,
  sessionId: string,
  level: SessionLogEntry["level"],
  message: string,
  source?: SessionLogEntry["source"],
): Promise<void> {
  await recordLog(runtime, sessionId, level, message, source);
}

export async function getSession(
  runtime: RuntimeStub,
  sessionId: string,
): Promise<PublicSessionRecord | null> {
  const session = await getActiveSession(runtime, sessionId);
  if (!session) {
    return null;
  }
  const { token: _token, ...publicSession } = session;
  return publicSession;
}

export async function isSessionValid(
  runtime: RuntimeStub,
  sessionId: string,
): Promise<boolean> {
  const session = await getActiveSession(runtime, sessionId);
  return session !== null;
}
