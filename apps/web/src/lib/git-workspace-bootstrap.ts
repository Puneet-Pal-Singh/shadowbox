import { gitBootstrapPath } from "./platform-endpoints.js";

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

interface ErrorPayload {
  error?: string;
}

export async function bootstrapGitWorkspace(
  request: GitWorkspaceBootstrapRequest,
): Promise<GitWorkspaceBootstrapResponse> {
  const response = await fetch(gitBootstrapPath(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let message = `Failed to bootstrap workspace: HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as ErrorPayload;
      if (typeof payload.error === "string" && payload.error.trim().length > 0) {
        message = payload.error;
      }
    } catch {
      // Keep HTTP fallback message.
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as GitWorkspaceBootstrapResponse;
  if (
    payload.status !== "ready" &&
    payload.status !== "needs-auth" &&
    payload.status !== "sync-failed" &&
    payload.status !== "invalid-context"
  ) {
    throw new Error("Invalid git bootstrap response");
  }
  return payload;
}
