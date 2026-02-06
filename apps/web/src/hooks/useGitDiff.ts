import { useEffect, useState } from "react";
import type { DiffContent } from "@repo/shared-types";
import { useRunContext } from "./useRunContext";

interface UseGitDiffResult {
  diff: DiffContent | null;
  loading: boolean;
  error: string | null;
  fetch: (path: string, staged?: boolean) => Promise<void>;
}

export function useGitDiff(): UseGitDiffResult {
  const { runId } = useRunContext();
  const [diff, setDiff] = useState<DiffContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDiff = async (path: string, staged = false) => {
    if (!runId) {
      setError("No run context available");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        runId,
        path,
        staged: String(staged),
      });

      const response = await fetch(`/api/git/diff?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch diff: ${response.statusText}`);
      }

      const data = (await response.json()) as DiffContent;
      setDiff(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("[useGitDiff] Error:", err);
    } finally {
      setLoading(false);
    }
  };

  return { diff, loading, error, fetch: fetchDiff };
}
