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

export function useGitStatus(explicitRunId?: string): UseGitStatusResult {
  const { runId: contextRunId } = useRunContext();
  const runId = explicitRunId ?? contextRunId;
  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!runId) {
      setLoading(false);
      setStatus(null);
      setError(null);
      return;
    }

    const cachedStatus = statusCacheByRunId.get(runId);
    if (cachedStatus) {
      setStatus(cachedStatus);
      setError(null);
    } else {
      setStatus(null);
    }

    const retryAfter = retryAfterByRunId.get(runId);
    if (retryAfter && Date.now() < retryAfter) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const request =
        inflightByRunId.get(runId) ?? createGitStatusRequest(runId);
      inflightByRunId.set(runId, request);
      const data = await request;

      statusCacheByRunId.set(runId, data);
      retryAfterByRunId.delete(runId);
      setStatus(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      retryAfterByRunId.set(runId, Date.now() + RETRY_DELAY_MS);
      setStatus(null);
      setError(message);
      if (lastLoggedErrorByRunId.get(runId) !== message) {
        console.error("[useGitStatus] Error:", err);
        lastLoggedErrorByRunId.set(runId, message);
      }
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  return { status, loading, error, refetch: fetchStatus };
}

async function createGitStatusRequest(runId: string): Promise<GitStatusResponse> {
  try {
    const response = await fetch(
      `${getBrainHttpBase()}/api/git/status?runId=${encodeURIComponent(runId)}`
    );

    if (!response.ok) {
      const message = await readGitStatusErrorMessage(response);
      throw new Error(message);
    }

    return (await response.json()) as GitStatusResponse;
  } finally {
    inflightByRunId.delete(runId);
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
