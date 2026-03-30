import { Env } from "../types/ai";
import { getCorsHeaders } from "../lib/cors";
import type {
  GitStatusResponse,
  DiffContent,
  CommitPayload,
  StageFilesRequest,
} from "@repo/shared-types";
import { z } from "zod";
import { WorkspaceBootstrapService } from "../runtime/services/WorkspaceBootstrapService";
import { sanitizeUnknownError } from "../core/security/LogSanitizer";
import {
  logErrorRateLimited,
  logWarnRateLimited,
} from "../lib/rate-limited-log";
import { toCanonicalGitExecutionAction } from "../lib/gitExecutionActions";
import {
  GIT_MUTATION_TIMEOUT_MS as MUSCLE_GIT_TIMEOUT_MS,
  GIT_STATUS_TIMEOUT_MS as MUSCLE_STATUS_TIMEOUT_MS,
} from "../services/gitExecutionTimeouts";

const GitBootstrapRequestBodySchema = z.object({
  runId: z.string(),
  sessionId: z.string().optional(),
  repositoryOwner: z.string(),
  repositoryName: z.string(),
  repositoryBranch: z.string().optional(),
  repositoryBaseUrl: z.string().optional(),
});

type GitBootstrapRequestBody = z.infer<typeof GitBootstrapRequestBodySchema>;
type GitBootstrapResult = Awaited<
  ReturnType<WorkspaceBootstrapService["bootstrap"]>
>;
const bootstrapRequestsByWorkspace = new Map<string, Promise<GitBootstrapResult>>();
const ERROR_LOG_WINDOW_MS = 30_000;
const GIT_SESSION_TIMEOUT_MS = 10_000;
type SecureApiFetch = Env["SECURE_API"]["fetch"];
type SecureApiResponse = Awaited<ReturnType<SecureApiFetch>>;
type SecureApiRequestInit = Parameters<SecureApiFetch>[1];

interface SecureMuscleSession {
  sessionId: string;
  token: string;
}

interface CanonicalExecutionResponse {
  taskId: string;
  status: "success" | "failure" | "timeout" | "cancelled";
  output?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * GitController
 * Handles Git operations by proxying to Muscle (secure-agent-api)
 * Single Responsibility: Coordinate git commands and responses
 */
export class GitController {
  /**
   * Get git status for a run's worktree
   */
  static async getStatus(req: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(req.url);
      const runId = url.searchParams.get("runId");
      const sessionId = url.searchParams.get("sessionId");

      if (!runId) {
        return errorResponse(req, env, "runId is required", 400);
      }

      const muscleSession = resolveMuscleSessionId(runId, sessionId);
      const rawPayload = await executeGitViaCanonicalApi(
        env,
        muscleSession,
        runId,
        "status",
        {},
        MUSCLE_STATUS_TIMEOUT_MS,
      );
      const data = parseGitPayload<GitStatusResponse>(rawPayload, "status");

      return corsJsonResponse(req, env, data);
    } catch (error) {
      if (
        error instanceof Error &&
        isNotGitRepositoryMessage(error.message)
      ) {
        return corsJsonResponse(req, env, getRecoverableNotGitStatus());
      }
      return handleGitControllerError(req, env, error, "getStatus");
    }
  }

  /**
   * Get diff for specific file or entire worktree
   */
  static async getDiff(req: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(req.url);
      const runId = url.searchParams.get("runId");
      const sessionId = url.searchParams.get("sessionId");
      const filePath = url.searchParams.get("path");
      const staged = url.searchParams.get("staged") === "true";

      if (!runId) {
        return errorResponse(req, env, "runId is required", 400);
      }

      const muscleSession = resolveMuscleSessionId(runId, sessionId);
      const rawPayload = await executeGitViaCanonicalApi(
        env,
        muscleSession,
        runId,
        "diff",
        {
          path: filePath,
          staged,
        },
        MUSCLE_GIT_TIMEOUT_MS,
      );
      const data = parseGitPayload<DiffContent>(rawPayload, "diff");

      return corsJsonResponse(req, env, data);
    } catch (error) {
      return handleGitControllerError(req, env, error, "getDiff");
    }
  }

  /**
   * Stage files for commit
   */
  static async stageFiles(req: Request, env: Env): Promise<Response> {
    try {
      const body = (await req.json()) as StageFilesRequest & {
        runId: string;
        sessionId?: string;
      };
      const { runId, sessionId, files, unstage = false } = body;

      if (!runId || !files || !Array.isArray(files)) {
        return errorResponse(req, env, "runId and files array are required", 400);
      }

      const muscleSession = resolveMuscleSessionId(runId, sessionId);
      const rawPayload = await executeGitViaCanonicalApi(
        env,
        muscleSession,
        runId,
        unstage ? "unstage" : "stage",
        { files },
        MUSCLE_GIT_TIMEOUT_MS,
      );
      assertPluginResultSuccess(rawPayload, unstage ? "unstage" : "stage");

      return corsJsonResponse(req, env, { success: true });
    } catch (error) {
      return handleGitControllerError(req, env, error, "stageFiles");
    }
  }

  /**
   * Commit staged changes
   */
  static async commit(req: Request, env: Env): Promise<Response> {
    try {
      const body = (await req.json()) as CommitPayload & {
        runId: string;
        sessionId?: string;
      };
      const { runId, sessionId, message, files } = body;

      if (!runId || !message) {
        return errorResponse(req, env, "runId and message are required", 400);
      }

      const muscleSession = resolveMuscleSessionId(runId, sessionId);
      const rawPayload = await executeGitViaCanonicalApi(
        env,
        muscleSession,
        runId,
        "commit",
        {
          message,
          files,
        },
        MUSCLE_GIT_TIMEOUT_MS,
      );
      assertPluginResultSuccess(rawPayload, "commit");

      return corsJsonResponse(req, env, { success: true });
    } catch (error) {
      return handleGitControllerError(req, env, error, "commit");
    }
  }

  /**
   * Bootstrap git workspace for a run before first chat turn.
   * Enables git status/diff/changes tab in newly-created tasks.
   */
  static async bootstrap(req: Request, env: Env): Promise<Response> {
    try {
      const body = await parseGitBootstrapRequestBody(req, env);
      if (!body) {
        return errorResponse(req, env, "Invalid git bootstrap request body", 400);
      }
      const {
        runId,
        sessionId,
        repositoryOwner,
        repositoryName,
        repositoryBranch,
        repositoryBaseUrl,
      } = body;

      const normalizedRunId = runId?.trim();
      const owner = repositoryOwner?.trim();
      const repo = repositoryName?.trim();
      const branch = repositoryBranch?.trim() || "main";
      const baseUrl = repositoryBaseUrl?.trim();

      if (!normalizedRunId || !owner || !repo) {
        return errorResponse(
          req,
          env,
          "runId, repositoryOwner, and repositoryName are required",
          400,
        );
      }

      const muscleSession = resolveMuscleSessionId(normalizedRunId, sessionId);
      const workspaceKey = `${muscleSession}:${normalizedRunId}`;
      const existingRequest = bootstrapRequestsByWorkspace.get(workspaceKey);
      if (existingRequest) {
        const result = await existingRequest;
        return corsJsonResponse(req, env, result);
      }

      const bootstrapper = WorkspaceBootstrapService.fromEnv(
        env,
        muscleSession,
        normalizedRunId,
      );
      const bootstrapRequest = bootstrapper.bootstrap({
        runId: normalizedRunId,
        repositoryContext: {
          owner,
          repo,
          branch,
          baseUrl,
        },
      });
      bootstrapRequestsByWorkspace.set(workspaceKey, bootstrapRequest);

      let result: GitBootstrapResult;
      try {
        result = await bootstrapRequest;
      } finally {
        if (bootstrapRequestsByWorkspace.get(workspaceKey) === bootstrapRequest) {
          bootstrapRequestsByWorkspace.delete(workspaceKey);
        }
      }

      return corsJsonResponse(req, env, result);
    } catch (error) {
      return handleGitControllerError(req, env, error, "bootstrap");
    }
  }
}

async function parseGitBootstrapRequestBody(
  req: Request,
  env: Env,
): Promise<GitBootstrapRequestBody | null> {
  let body: unknown;
  try {
    body = await req.json();
  } catch (error) {
    logWarnRateLimited(
      "GitController:bootstrap:invalid-json",
      "[GitController:bootstrap] Invalid JSON body",
      { error: sanitizeUnknownError(error) },
      ERROR_LOG_WINDOW_MS,
    );
    return null;
  }

  const parsedBody = GitBootstrapRequestBodySchema.safeParse(body);
  if (!parsedBody.success) {
    logWarnRateLimited(
      "GitController:bootstrap:validation-failed",
      "[GitController:bootstrap] Body validation failed",
      {
        issues: parsedBody.error.issues,
        environment: env.NODE_ENV,
      },
      ERROR_LOG_WINDOW_MS,
    );
    return null;
  }

  return parsedBody.data;
}

interface PluginSuccessPayload {
  success: true;
  output?: unknown;
}

function resolveMuscleSessionId(runId: string, sessionId?: string | null): string {
  const normalizedSessionId = sessionId?.trim();
  if (normalizedSessionId && normalizedSessionId.length > 0) {
    return normalizedSessionId;
  }
  return runId;
}

interface PluginErrorPayload {
  success: false;
  error?: string;
}

async function executeGitViaCanonicalApi(
  env: Env,
  muscleSession: string,
  runId: string,
  action: "status" | "diff" | "stage" | "unstage" | "commit",
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<PluginSuccessPayload | PluginErrorPayload> {
  const secureSession = await createSecureMuscleSession(
    env.SECURE_API,
    muscleSession,
    runId,
    action,
  );

  const response = await fetchSecureApiWithTimeout(
    env.SECURE_API,
    buildSecureApiUrl(muscleSession, "/api/v1/execute"),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secureSession.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: secureSession.sessionId,
        taskId: createGitTaskId(action),
        action: "git.execute",
        params: {
          action: toCanonicalGitExecutionAction(action),
          runId,
          ...payload,
        },
        timeout: timeoutMs,
      }),
    },
    timeoutMs,
  );

  await assertMuscleResponseOk(response, action);
  const canonicalResponse = parseCanonicalExecutionResponse(
    (await response.json()) as unknown,
  );
  return normalizeCanonicalGitResponse(canonicalResponse);
}

async function createSecureMuscleSession(
  service: Env["SECURE_API"],
  muscleSession: string,
  runId: string,
  action: string,
): Promise<SecureMuscleSession> {
  const response = await fetchSecureApiWithTimeout(
    service,
    buildSecureApiUrl(muscleSession, "/api/v1/session"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        runId,
        taskId: `git-${action}-${runId}`,
        repoPath: ".",
      }),
    },
    GIT_SESSION_TIMEOUT_MS,
  );

  if (!response.ok) {
    const details = await readErrorPreview(response);
    const suffix = details ? `: ${details}` : "";
    throw new Error(
      `Git ${action} failed to create execution session with HTTP ${response.status}${suffix}`,
    );
  }

  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== "object") {
    throw new Error("Git execution session returned an invalid response");
  }

  const candidate = payload as {
    sessionId?: unknown;
    token?: unknown;
  };
  if (
    typeof candidate.sessionId !== "string" ||
    typeof candidate.token !== "string"
  ) {
    throw new Error("Git execution session response is missing credentials");
  }

  return {
    sessionId: candidate.sessionId,
    token: candidate.token,
  };
}

function buildSecureApiUrl(
  muscleSession: string,
  pathname: string,
): string {
  const url = new URL(pathname, "http://internal/");
  url.searchParams.set("session", muscleSession);
  return url.toString();
}

function parseCanonicalExecutionResponse(
  payload: unknown,
): CanonicalExecutionResponse {
  if (!payload || typeof payload !== "object") {
    throw new Error("Git execution returned an invalid response payload");
  }

  const candidate = payload as {
    taskId?: unknown;
    status?: unknown;
    output?: unknown;
    error?: unknown;
  };
  if (
    typeof candidate.taskId !== "string" ||
    (candidate.status !== "success" &&
      candidate.status !== "failure" &&
      candidate.status !== "timeout" &&
      candidate.status !== "cancelled")
  ) {
    throw new Error("Git execution returned an invalid canonical response");
  }

  const error = parseCanonicalExecutionError(candidate.error);
  return {
    taskId: candidate.taskId,
    status: candidate.status,
    output: typeof candidate.output === "string" ? candidate.output : undefined,
    error,
  };
}

function parseCanonicalExecutionError(
  payload: unknown,
): CanonicalExecutionResponse["error"] {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const candidate = payload as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
  if (
    typeof candidate.code !== "string" ||
    typeof candidate.message !== "string"
  ) {
    return undefined;
  }

  return {
    code: candidate.code,
    message: candidate.message,
    details: candidate.details,
  };
}

function normalizeCanonicalGitResponse(
  payload: CanonicalExecutionResponse,
): PluginSuccessPayload | PluginErrorPayload {
  if (payload.status === "success") {
    return {
      success: true,
      output: payload.output,
    };
  }

  return {
    success: false,
    error:
      payload.error?.message ??
      `Git task ended with status '${payload.status}'`,
  };
}

function createGitTaskId(
  action: "status" | "diff" | "stage" | "unstage" | "commit",
): string {
  return `git-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isPluginPayload(
  payload: unknown,
): payload is PluginSuccessPayload | PluginErrorPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  return "success" in payload;
}

function parseGitPayload<T>(
  payload: unknown,
  operation: "status" | "diff",
): T {
  if (isPluginPayload(payload)) {
    if (payload.success === false) {
      const details =
        typeof payload.error === "string" && payload.error.trim().length > 0
          ? payload.error.trim()
          : "unknown plugin error";
      if (operation === "status" && isNotGitRepositoryMessage(details)) {
        return getRecoverableNotGitStatus() as unknown as T;
      }
      throw new Error(`Git ${operation} failed: ${details}`);
    }

    if (payload.output === undefined) {
      throw new Error(`Git ${operation} returned no output payload`);
    }

    return parseGitOutput<T>(payload.output, operation);
  }

  return payload as T;
}

function isNotGitRepositoryMessage(message: string): boolean {
  return /not a git repository/i.test(message);
}

function getRecoverableNotGitStatus(): GitStatusResponse {
  return {
    files: [],
    ahead: 0,
    behind: 0,
    branch: "",
    repoIdentity: null,
    hasStaged: false,
    hasUnstaged: false,
    gitAvailable: false,
    recoverableCode: "NOT_A_GIT_REPOSITORY",
  };
}

function parseGitOutput<T>(
  output: unknown,
  operation: "status" | "diff",
): T {
  if (typeof output === "string") {
    try {
      return JSON.parse(output) as T;
    } catch {
      throw new Error(`Git ${operation} returned invalid JSON output`);
    }
  }

  if (output && typeof output === "object") {
    return output as T;
  }

  throw new Error(`Git ${operation} returned unsupported output format`);
}

function corsJsonResponse(
  req: Request,
  env: Env,
  data: unknown,
  status: number = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(req, env),
    },
  });
}

function handleGitControllerError(
  req: Request,
  env: Env,
  error: unknown,
  operation: "getStatus" | "getDiff" | "stageFiles" | "commit" | "bootstrap",
): Response {
  const mapped = mapGitControllerError(error, operation);
  const logMessage = `[GitController:${operation}] ${mapped.code}: ${mapped.message}`;
  const logKey = `GitController:${operation}:${mapped.code}:${mapped.message}`;

  if (mapped.retryable) {
    logWarnRateLimited(
      logKey,
      logMessage,
      { error: sanitizeUnknownError(error) },
      ERROR_LOG_WINDOW_MS,
    );
  } else {
    logErrorRateLimited(
      logKey,
      logMessage,
      sanitizeUnknownError(error),
      ERROR_LOG_WINDOW_MS,
    );
  }

  return errorResponse(
    req,
    env,
    mapped.message,
    mapped.status,
    mapped.code,
    mapped.retryable,
  );
}

function mapGitControllerError(
  error: unknown,
  operation: "getStatus" | "getDiff" | "stageFiles" | "commit" | "bootstrap",
): {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
} {
  const fallbackMessage = getDefaultOperationError(operation);
  const message = error instanceof Error ? error.message : fallbackMessage;
  if (isGitExecutionContractError(message)) {
    return {
      status: 502,
      code: "GIT_EXECUTION_CONTRACT_ERROR",
      message:
        "Git workspace bootstrap failed because Brain and the secure runtime disagreed on the git execution contract. Refresh and retry.",
      retryable: true,
    };
  }

  if (isTransientGitServiceError(message)) {
    return {
      status: 503,
      code: "GIT_SERVICE_UNAVAILABLE",
      message:
        "Git service is temporarily unavailable. Please retry in a few seconds.",
      retryable: true,
    };
  }

  return {
    status: 500,
    code: "GIT_OPERATION_FAILED",
    message,
    retryable: false,
  };
}

function isGitExecutionContractError(message: string): boolean {
  return (
    message.includes("git.execute") ||
    /invalid enum value/i.test(message) ||
    /received ['"]git\.execute['"]/i.test(message)
  );
}

function isTransientGitServiceError(message: string): boolean {
  return (
    /network connection lost/i.test(message) ||
    /failed to fetch/i.test(message) ||
    /service unavailable/i.test(message) ||
    /timed out/i.test(message) ||
    /econnrefused/i.test(message) ||
    /upstream connect error/i.test(message) ||
    /sandboxerror:\s*http error!\s*status:\s*5\d\d/i.test(message) ||
    /http error!\s*status:\s*5\d\d/i.test(message) ||
    /failed with http 5\d\d/i.test(message)
  );
}

function getDefaultOperationError(
  operation: "getStatus" | "getDiff" | "stageFiles" | "commit" | "bootstrap",
): string {
  switch (operation) {
    case "getStatus":
      return "Failed to get git status";
    case "getDiff":
      return "Failed to get diff";
    case "stageFiles":
      return "Failed to stage files";
    case "commit":
      return "Failed to commit";
    case "bootstrap":
      return "Failed to bootstrap git workspace";
  }
}

function errorResponse(
  req: Request,
  env: Env,
  message: string,
  status: number,
  code?: string,
  retryable?: boolean,
): Response {
  const payload = {
    error: message,
    ...(code ? { code } : {}),
    ...(typeof retryable === "boolean" ? { retryable } : {}),
  };

  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(req, env),
    },
  });
}

async function fetchSecureApiWithTimeout(
  service: Env["SECURE_API"],
  url: string,
  init: SecureApiRequestInit,
  timeoutMs: number,
): Promise<SecureApiResponse> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      service.fetch(url, init),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Git request timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function assertMuscleResponseOk(
  response: SecureApiResponse,
  operation: "status" | "diff" | "stage" | "unstage" | "commit",
): Promise<void> {
  if (response.ok) {
    return;
  }
  const details = await readErrorPreview(response);
  const suffix = details ? `: ${details}` : "";
  throw new Error(
    `Git ${operation} failed with HTTP ${response.status}${suffix}`,
  );
}

function assertPluginResultSuccess(
  payload: unknown,
  operation: "stage" | "unstage" | "commit",
): void {
  if (!isPluginPayload(payload)) {
    return;
  }
  if (payload.success) {
    return;
  }

  const details =
    typeof payload.error === "string" && payload.error.trim().length > 0
      ? payload.error.trim()
      : "unknown plugin error";
  throw new Error(`Git ${operation} failed: ${details}`);
}

async function readErrorPreview(response: SecureApiResponse): Promise<string> {
  try {
    const payload = (await response.clone().json()) as { error?: string };
    if (typeof payload.error === "string" && payload.error.trim().length > 0) {
      return payload.error.trim();
    }
  } catch {
    // No-op: fallback to text preview.
  }

  try {
    const text = (await response.text()).trim();
    if (text.length > 0) {
      return text.slice(0, 200);
    }
  } catch {
    logWarnRateLimited(
      "git/controller:error-preview-read-failed",
      `[git/controller] Failed to read error preview body (status=${response.status})`,
      undefined,
      ERROR_LOG_WINDOW_MS,
    );
  }

  logWarnRateLimited(
    "git/controller:error-preview-empty",
    `[git/controller] Empty error preview for non-OK response (status=${response.status} ${response.statusText})`,
    undefined,
    ERROR_LOG_WINDOW_MS,
  );
  return "";
}
