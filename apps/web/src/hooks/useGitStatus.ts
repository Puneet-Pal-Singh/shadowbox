import { useEffect, useState } from "react";
import type { GitStatusResponse } from "@repo/shared-types";
import { useRunContext } from "./useRunContext";

interface UseGitStatusResult {
  status: GitStatusResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useGitStatus(): UseGitStatusResult {
  const { runId } = useRunContext();
  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    if (!runId) {
      setError("No run context available");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/git/status?runId=${encodeURIComponent(runId)}`,
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch git status: ${response.statusText}`);
      }

      const data = (await response.json()) as GitStatusResponse;
      setStatus(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("[useGitStatus] Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [runId]);

  return { status, loading, error, refetch: fetchStatus };
}
