import { useState } from "react";
import type { CommitPayload } from "@repo/shared-types";
import { useRunContext } from "./useRunContext";

interface UseGitCommitResult {
  committing: boolean;
  error: string | null;
  commit: (payload: CommitPayload) => Promise<void>;
}

export function useGitCommit(): UseGitCommitResult {
  const { runId } = useRunContext();
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const performCommit = async (payload: CommitPayload) => {
    if (!runId) {
      setError("No run context available");
      return;
    }

    setCommitting(true);
    setError(null);

    try {
      const response = await fetch("/api/git/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, runId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to commit: ${response.statusText}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("[useGitCommit] Error:", err);
    } finally {
      setCommitting(false);
    }
  };

  return { committing, error, commit: performCommit };
}
