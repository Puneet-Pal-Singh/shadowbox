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

/**
 * GitController
 * Handles Git operations by proxying to Muscle (secure-agent-api)
 * Single Responsibility: Coordinate git commands and responses
 */
export class GitController {
  /**
   * Get Muscle base URL from environment
   * Ensures no hardcoded localhost in production paths
   */
  private static getMuscleBaseUrl(env: Env): string {
    const configuredBaseUrl = env.MUSCLE_BASE_URL?.trim();
    if (configuredBaseUrl) {
      return configuredBaseUrl.replace(/\/+$/, "");
    }

    if (env.NODE_ENV === "production") {
      throw new Error("MUSCLE_BASE_URL is required in production");
    }

    const localDevFallback = "http://localhost:8787";
    console.warn(
      `[GitController] MUSCLE_BASE_URL not configured, using dev fallback: ${localDevFallback}`,
    );
    return localDevFallback;
  }

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
      const response = await fetch(
        `${GitController.getMuscleBaseUrl(env)}/?session=${encodeURIComponent(muscleSession)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            plugin: "git",
            payload: {
              action: "status",
              runId,
            },
          }),
        },
      );

      await assertMuscleResponseOk(response, "status");

      const rawPayload = (await response.json()) as unknown;
      const data = parseGitPayload<GitStatusResponse>(rawPayload, "status");

      return corsJsonResponse(req, env, data);
    } catch (error) {
      if (
        error instanceof Error &&
        isNotGitRepositoryMessage(error.message)
      ) {
        return corsJsonResponse(req, env, getRecoverableNotGitStatus());
      }
      console.error("[GitController:getStatus] Error:", error);
      return errorResponse(
        req,
        env,
        error instanceof Error ? error.message : "Failed to get git status",
        500,
      );
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
      const response = await fetch(
       `${GitController.getMuscleBaseUrl(env)}/?session=${encodeURIComponent(muscleSession)}`,
       {
         method: "POST",
         headers: {
           "Content-Type": "application/json",
         },
         body: JSON.stringify({
           plugin: "git",
           payload: {
             action: "diff",
              runId,
              path: filePath,
              staged,
            },
          }),
        },
      );

      await assertMuscleResponseOk(response, "diff");

      const rawPayload = (await response.json()) as unknown;
      const data = parseGitPayload<DiffContent>(rawPayload, "diff");

      return corsJsonResponse(req, env, data);
    } catch (error) {
      console.error("[GitController:getDiff] Error:", error);
      return errorResponse(
        req,
        env,
        error instanceof Error ? error.message : "Failed to get diff",
        500,
      );
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
      const response = await fetch(
        `${GitController.getMuscleBaseUrl(env)}/?session=${encodeURIComponent(muscleSession)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            plugin: "git",
            payload: {
              action: unstage ? "unstage" : "stage",
              runId,
              files,
            },
          }),
        },
      );

      await assertMuscleResponseOk(response, unstage ? "unstage" : "stage");
      await assertPluginResultSuccess(response, unstage ? "unstage" : "stage");

      return corsJsonResponse(req, env, { success: true });
    } catch (error) {
      console.error("[GitController:stageFiles] Error:", error);
      return errorResponse(
        req,
        env,
        error instanceof Error ? error.message : "Failed to stage files",
        500,
      );
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
      const response = await fetch(
        `${GitController.getMuscleBaseUrl(env)}/?session=${encodeURIComponent(muscleSession)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            plugin: "git",
            payload: {
              action: "commit",
              runId,
              message,
              files,
            },
          }),
        },
      );

      await assertMuscleResponseOk(response, "commit");
      await assertPluginResultSuccess(response, "commit");

      return corsJsonResponse(req, env, { success: true });
    } catch (error) {
      console.error("[GitController:commit] Error:", error);
      return errorResponse(
        req,
        env,
        error instanceof Error ? error.message : "Failed to commit",
        500,
      );
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
      console.error("[GitController:bootstrap] Error:", error);
      return errorResponse(
        req,
        env,
        error instanceof Error ? error.message : "Failed to bootstrap git workspace",
        500,
      );
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
    console.warn("[GitController:bootstrap] Invalid JSON body", { error });
    return null;
  }

  const parsedBody = GitBootstrapRequestBodySchema.safeParse(body);
  if (!parsedBody.success) {
    console.warn("[GitController:bootstrap] Body validation failed", {
      issues: parsedBody.error.issues,
      environment: env.NODE_ENV,
    });
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

function errorResponse(req: Request, env: Env, message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(req, env),
    },
  });
}

async function assertMuscleResponseOk(
  response: Response,
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

async function assertPluginResultSuccess(
  response: Response,
  operation: "stage" | "unstage" | "commit",
): Promise<void> {
  const payload = (await response.clone().json()) as unknown;
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

async function readErrorPreview(response: Response): Promise<string> {
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
    console.warn(
      `[git/controller] Failed to read error preview body (status=${response.status})`,
    );
  }

  console.warn(
    `[git/controller] Empty error preview for non-OK response (status=${response.status} ${response.statusText})`,
  );
  return "";
}
