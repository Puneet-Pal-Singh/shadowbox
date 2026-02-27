import { useEffect, useState, useCallback } from "react";
import type { GitStatusResponse } from "@repo/shared-types";
import { useRunContext } from "./useRunContext";
import { getBrainHttpBase } from "../lib/platform-endpoints.js";

interface UseGitStatusResult {
  status: GitStatusResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const statusCacheByRunId = new Map<string, GitStatusResponse>();
const inflightByRunId = new Map<string, Promise<GitStatusResponse>>();
const retryAfterByRunId = new Map<string, number>();
const lastLoggedErrorByRunId = new Map<string, string>();

const RETRY_DELAY_MS = 5000;

export function useGitStatus(
  explicitRunId?: string,
  explicitSessionId?: string,
): UseGitStatusResult {
  const { runId: contextRunId, sessionId: contextSessionId } = useRunContext();
  const runId = explicitRunId ?? contextRunId;
  const sessionId = explicitSessionId ?? contextSessionId;
  const cacheKey = runId && sessionId ? `${sessionId}:${runId}` : null;
  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!runId || !sessionId || !cacheKey) {
      setLoading(false);
      setStatus(null);
      setError(!runId ? null : "No session context available");
      return;
    }

    const cachedStatus = statusCacheByRunId.get(cacheKey);
    if (cachedStatus) {
      setStatus(cachedStatus);
      setError(null);
    } else {
      setStatus(null);
    }

    const retryAfter = retryAfterByRunId.get(cacheKey);
    if (retryAfter && Date.now() < retryAfter) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const request =
        inflightByRunId.get(cacheKey) ?? createGitStatusRequest(runId, sessionId);
      inflightByRunId.set(cacheKey, request);
      const data = await request;

      statusCacheByRunId.set(cacheKey, data);
      retryAfterByRunId.delete(cacheKey);
      setStatus(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      retryAfterByRunId.set(cacheKey, Date.now() + RETRY_DELAY_MS);
      setStatus(null);
      setError(message);
      if (lastLoggedErrorByRunId.get(cacheKey) !== message) {
        console.error("[useGitStatus] Error:", err);
        lastLoggedErrorByRunId.set(cacheKey, message);
      }
    } finally {
      setLoading(false);
    }
  }, [cacheKey, runId, sessionId]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  return { status, loading, error, refetch: fetchStatus };
}

async function createGitStatusRequest(
  runId: string,
  sessionId: string,
): Promise<GitStatusResponse> {
  const cacheKey = `${sessionId}:${runId}`;
  try {
    const response = await fetch(
      `${getBrainHttpBase()}/api/git/status?runId=${encodeURIComponent(runId)}&sessionId=${encodeURIComponent(sessionId)}`
    );

    if (!response.ok) {
      const message = await readGitStatusErrorMessage(response);
      throw new Error(message);
    }

    const payload = (await response.json()) as unknown;
    return normalizeGitStatusResponse(payload);
  } finally {
    inflightByRunId.delete(cacheKey);
  }
}

async function readGitStatusErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload.error) {
      return payload.error;
    }
  } catch {
    // No-op, fallback below.
  }
  return `Failed to fetch git status: HTTP ${response.status}`;
}

function normalizeGitStatusResponse(payload: unknown): GitStatusResponse {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid git status response: expected JSON object");
  }

  const apiErrorPayload = payload as { success?: boolean; error?: string };
  if (
    apiErrorPayload.success === false &&
    typeof apiErrorPayload.error === "string"
  ) {
    if (apiErrorPayload.error.includes("not a git repository")) {
      return getEmptyGitStatus();
    }
    throw new Error(apiErrorPayload.error);
  }

  const candidate = payload as Partial<GitStatusResponse>;
  const files = Array.isArray(candidate.files) ? candidate.files : [];
  if (!Array.isArray(candidate.files) && looksLikeSoftGitStatusPayload(payload)) {
    return getEmptyGitStatus();
  }

  return {
    files,
    ahead: typeof candidate.ahead === "number" ? candidate.ahead : 0,
    behind: typeof candidate.behind === "number" ? candidate.behind : 0,
    branch: typeof candidate.branch === "string" ? candidate.branch : "",
    hasStaged:
      typeof candidate.hasStaged === "boolean" ? candidate.hasStaged : false,
    hasUnstaged:
      typeof candidate.hasUnstaged === "boolean" ? candidate.hasUnstaged : false,
  };
}

function looksLikeSoftGitStatusPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const objectPayload = payload as Record<string, unknown>;
  return (
    "success" in objectPayload ||
    "error" in objectPayload ||
    "message" in objectPayload
  );
}

function getEmptyGitStatus(): GitStatusResponse {
  return {
    files: [],
    ahead: 0,
    behind: 0,
    branch: "",
    hasStaged: false,
    hasUnstaged: false,
  };
}
