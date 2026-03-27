import { useState } from "react";
import type { CommitPayload } from "@repo/shared-types";
import { useRunContext } from "./useRunContext";
import { commitGitChanges } from "../lib/git-client.js";

interface UseGitCommitResult {
  committing: boolean;
  error: string | null;
  commit: (payload: CommitPayload) => Promise<boolean>;
}

export function useGitCommit(
  explicitRunId?: string,
  explicitSessionId?: string,
): UseGitCommitResult {
  const { runId: contextRunId, sessionId: contextSessionId } = useRunContext();
  const runId = explicitRunId ?? contextRunId;
  const sessionId = explicitSessionId ?? contextSessionId;
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const performCommit = async (payload: CommitPayload) => {
    if (!runId) {
      setError("No run context available");
      return false;
    }
    if (!sessionId) {
      setError("No session context available");
      return false;
    }

    setCommitting(true);
    setError(null);

    try {
      await commitGitChanges({
        runId,
        sessionId,
        payload,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("[useGitCommit] Error:", err);
      return false;
    } finally {
      setCommitting(false);
    }
  };

  return { committing, error, commit: performCommit };
}
