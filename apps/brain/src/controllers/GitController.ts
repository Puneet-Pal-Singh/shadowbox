import { Env } from "../types/ai";
import { CORS_HEADERS } from "../lib/cors";
import type {
  GitStatusResponse,
  DiffContent,
  CommitPayload,
  StageFilesRequest,
} from "../../../../packages/shared-types/src/git";

/**
 * GitController
 * Handles Git operations by proxying to Muscle (secure-agent-api)
 * Single Responsibility: Coordinate git commands and responses
 */
export class GitController {
  private static readonly MUSCLE_BASE_URL = "http://localhost:8787";

  /**
   * Get git status for a run's worktree
   */
  static async getStatus(req: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(req.url);
      const runId = url.searchParams.get("runId");

      if (!runId) {
        return errorResponse("runId is required", 400);
      }

      const response = await fetch(
        `${this.MUSCLE_BASE_URL}/?session=${runId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
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

      if (!response.ok) {
        throw new Error(`Muscle returned ${response.status}`);
      }

      const data = (await response.json()) as GitStatusResponse;

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      });
    } catch (error) {
      console.error("[GitController:getStatus] Error:", error);
      return errorResponse(
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
        return errorResponse("runId is required", 400);
      }

      const response = await fetch(
        `${this.MUSCLE_BASE_URL}/?session=${runId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
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

      if (!response.ok) {
        throw new Error(`Muscle returned ${response.status}`);
      }

      const data = (await response.json()) as DiffContent;

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      });
    } catch (error) {
      console.error("[GitController:getDiff] Error:", error);
      return errorResponse(
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
        return errorResponse("runId and files array are required", 400);
      }

      const response = await fetch(
        `${this.MUSCLE_BASE_URL}/?session=${runId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
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

      if (!response.ok) {
        throw new Error(`Muscle returned ${response.status}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      });
    } catch (error) {
      console.error("[GitController:stageFiles] Error:", error);
      return errorResponse(
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
        return errorResponse("runId and message are required", 400);
      }

      const response = await fetch(
        `${this.MUSCLE_BASE_URL}/?session=${runId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
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

      if (!response.ok) {
        throw new Error(`Muscle returned ${response.status}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      });
    } catch (error) {
      console.error("[GitController:commit] Error:", error);
      return errorResponse(
        error instanceof Error ? error.message : "Failed to commit",
        500,
      );
    }
  }
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}
