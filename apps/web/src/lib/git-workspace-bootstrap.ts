import { gitBootstrapPath } from "./platform-endpoints.js";
import { z } from "zod";

export interface GitWorkspaceBootstrapRequest {
  runId: string;
  sessionId: string;
  repositoryOwner: string;
  repositoryName: string;
  repositoryBranch?: string;
  repositoryBaseUrl?: string;
}

export interface GitWorkspaceBootstrapResponse {
  status: "ready" | "needs-auth" | "sync-failed" | "invalid-context";
  message?: string;
}

const GitWorkspaceBootstrapRequestSchema = z.object({
  runId: z.string().min(1),
  sessionId: z.string().min(1),
  repositoryOwner: z.string().min(1),
  repositoryName: z.string().min(1),
  repositoryBranch: z.string().optional(),
  repositoryBaseUrl: z.string().url().optional(),
});

const GitWorkspaceBootstrapResponseSchema = z.object({
  status: z.enum(["ready", "needs-auth", "sync-failed", "invalid-context"]),
  message: z.string().optional(),
});

const ErrorPayloadSchema = z.object({
  error: z.string().optional(),
});

export async function bootstrapGitWorkspace(
  request: GitWorkspaceBootstrapRequest,
): Promise<GitWorkspaceBootstrapResponse> {
  const validatedRequest = GitWorkspaceBootstrapRequestSchema.parse(request);
  const response = await fetch(gitBootstrapPath(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(validatedRequest),
  });

  if (!response.ok) {
    let message = `Failed to bootstrap workspace: HTTP ${response.status}`;
    try {
      const payload = ErrorPayloadSchema.parse(await response.json());
      if (payload.error && payload.error.trim().length > 0) {
        message = payload.error;
      }
    } catch {
      // Keep HTTP fallback message.
    }
    throw new Error(message);
  }

  const payload = GitWorkspaceBootstrapResponseSchema.parse(await response.json());
  return payload;
}
