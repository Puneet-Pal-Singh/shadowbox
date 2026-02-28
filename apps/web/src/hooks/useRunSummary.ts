import { useCallback, useEffect, useState } from "react";
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

const POLL_INTERVAL_MS = 1500;

export function useRunSummary(runId: string, shouldPoll: boolean): UseRunSummaryResult {
  const [summary, setSummary] = useState<RunSummary | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!runId) {
      setSummary(null);
      return;
    }

    try {
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
    }
  }, [runId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchSummary();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchSummary]);

  useEffect(() => {
    if (!shouldPoll || !runId) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void fetchSummary();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [fetchSummary, runId, shouldPoll]);

  return { summary };
}
