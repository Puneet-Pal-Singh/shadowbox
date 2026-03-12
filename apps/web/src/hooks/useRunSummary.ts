import { useCallback, useEffect, useRef, useState } from "react";
import { getBrainHttpBase } from "../lib/platform-endpoints.js";

interface RunSummary {
  runId: string;
  status: string | null;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
}

interface UseRunSummaryResult {
  summary: RunSummary | null;
}

const POLL_INTERVAL_MS = 8000;
const TERMINAL_RUN_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

export function useRunSummary(runId: string, shouldPoll: boolean): UseRunSummaryResult {
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const inFlightRef = useRef(false);

  const fetchSummary = useCallback(async () => {
    if (!runId) {
      setSummary(null);
      return;
    }
    if (inFlightRef.current) {
      return;
    }

    try {
      inFlightRef.current = true;
      const response = await fetch(
        `${getBrainHttpBase()}/api/run/summary?runId=${encodeURIComponent(runId)}`,
      );
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as RunSummary;
      setSummary(payload);
    } catch {
      // Ignore non-critical summary fetch errors; chat remains functional.
    } finally {
      inFlightRef.current = false;
    }
  }, [runId]);

  useEffect(() => {
    if (!runId || !shouldPoll) {
      return;
    }
    void fetchSummary();
  }, [fetchSummary, runId, shouldPoll]);

  useEffect(() => {
    const isTerminal = Boolean(summary?.status && TERMINAL_RUN_STATUSES.has(summary.status));
    if (!shouldPoll || !runId || isTerminal) {
      return;
    }
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void fetchSummary();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [fetchSummary, runId, shouldPoll, summary?.status]);

  return { summary };
}
