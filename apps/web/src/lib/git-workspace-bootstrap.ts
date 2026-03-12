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

const bootstrapInFlight = new Map<
  string,
  Promise<GitWorkspaceBootstrapResponse>
>();
const bootstrapSuccessCache = new Map<
  string,
  { result: GitWorkspaceBootstrapResponse; cachedAt: number }
>();
const BOOTSTRAP_SUCCESS_TTL_MS = 2 * 60 * 1000;

export async function bootstrapGitWorkspace(
  request: GitWorkspaceBootstrapRequest,
): Promise<GitWorkspaceBootstrapResponse> {
  const validatedRequest = GitWorkspaceBootstrapRequestSchema.parse(request);
  const requestKey = getBootstrapRequestKey(validatedRequest);
  pruneBootstrapSuccessCache();

  const cached = bootstrapSuccessCache.get(requestKey);
  if (cached && Date.now() - cached.cachedAt < BOOTSTRAP_SUCCESS_TTL_MS) {
    return cached.result;
  }

  const inFlight = bootstrapInFlight.get(requestKey);
  if (inFlight) {
    return inFlight;
  }

  const promise = executeBootstrapRequest(validatedRequest);
  bootstrapInFlight.set(requestKey, promise);

  try {
    const result = await promise;
    if (result.status === "ready") {
      bootstrapSuccessCache.set(requestKey, {
        result,
        cachedAt: Date.now(),
      });
    }
    return result;
  } finally {
    if (bootstrapInFlight.get(requestKey) === promise) {
      bootstrapInFlight.delete(requestKey);
    }
  }
}

async function executeBootstrapRequest(
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
    throw new Error(await extractBootstrapErrorMessage(response));
  }

  const payload = GitWorkspaceBootstrapResponseSchema.parse(await response.json());
  return payload;
}

async function extractBootstrapErrorMessage(response: Response): Promise<string> {
  let message = `Failed to bootstrap workspace: HTTP ${response.status}`;
  try {
    const payload = ErrorPayloadSchema.parse(await response.json());
    if (payload.error && payload.error.trim().length > 0) {
      message = payload.error;
    }
  } catch {
    // Keep HTTP fallback message.
  }
  return message;
}

function getBootstrapRequestKey(request: GitWorkspaceBootstrapRequest): string {
  return [
    request.sessionId.trim(),
    request.runId.trim(),
    request.repositoryOwner.trim(),
    request.repositoryName.trim(),
    request.repositoryBranch?.trim() ?? "",
    request.repositoryBaseUrl?.trim() ?? "",
  ].join(":");
}

function pruneBootstrapSuccessCache(): void {
  const now = Date.now();
  for (const [key, entry] of bootstrapSuccessCache.entries()) {
    if (now - entry.cachedAt >= BOOTSTRAP_SUCCESS_TTL_MS) {
      bootstrapSuccessCache.delete(key);
    }
  }
}

export function _resetGitBootstrapInFlightForTests(): void {
  bootstrapInFlight.clear();
  bootstrapSuccessCache.clear();
}
