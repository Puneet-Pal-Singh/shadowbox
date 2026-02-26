import { Env } from "../types/ai";
import { getCorsHeaders } from "../lib/cors";
import type {
  GitStatusResponse,
  DiffContent,
  CommitPayload,
  StageFilesRequest,
} from "@repo/shared-types";

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

      if (!runId) {
        return errorResponse(req, env, "runId is required", 400);
      }

      const response = await fetch(
        `${GitController.getMuscleBaseUrl(env)}/?session=${runId}`,
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

      const data = (await response.json()) as GitStatusResponse;

      return corsJsonResponse(req, env, data);
    } catch (error) {
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
      const filePath = url.searchParams.get("path");
      const staged = url.searchParams.get("staged") === "true";

      if (!runId) {
        return errorResponse(req, env, "runId is required", 400);
      }

      const response = await fetch(
       `${GitController.getMuscleBaseUrl(env)}/?session=${runId}`,
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

      const data = (await response.json()) as DiffContent;

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
      const body = (await req.json()) as StageFilesRequest & { runId: string };
      const { runId, files, unstage = false } = body;

      if (!runId || !files || !Array.isArray(files)) {
        return errorResponse(req, env, "runId and files array are required", 400);
      }

      const response = await fetch(
        `${GitController.getMuscleBaseUrl(env)}/?session=${runId}`,
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
      const body = (await req.json()) as CommitPayload & { runId: string };
      const { runId, message, files } = body;

      if (!runId || !message) {
        return errorResponse(req, env, "runId and message are required", 400);
      }

      const response = await fetch(
        `${GitController.getMuscleBaseUrl(env)}/?session=${runId}`,
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
