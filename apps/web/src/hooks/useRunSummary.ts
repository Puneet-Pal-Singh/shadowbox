import { useCallback, useEffect, useRef, useState } from "react";
import { getBrainHttpBase } from "../lib/platform-endpoints.js";
import { RUN_SUMMARY_REFRESH_EVENT } from "../lib/run-summary-events.js";

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

const TERMINAL_RUN_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const SUMMARY_ERROR_LOG_WINDOW_MS = 30_000;

export function useRunSummary(runId: string, shouldPoll: boolean): UseRunSummaryResult {
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const inFlightRef = useRef(false);
  const lastSummaryErrorLogRef = useRef<{
    timestamp: number;
    message: string;
  } | null>(null);

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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const now = Date.now();
      const previous = lastSummaryErrorLogRef.current;
      const shouldLog =
        !previous ||
        previous.message !== message ||
        now - previous.timestamp >= SUMMARY_ERROR_LOG_WINDOW_MS;
      if (shouldLog) {
        console.warn(
          `[run/summary] failed to fetch summary for runId=${runId}: ${message}`,
        );
        lastSummaryErrorLogRef.current = {
          timestamp: now,
          message,
        };
      }
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
    if (!runId) {
      return;
    }

    const handleRefreshEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ runId?: string }>;
      if (customEvent.detail?.runId !== runId) {
        return;
      }

      const isTerminal = Boolean(
        summary?.status && TERMINAL_RUN_STATUSES.has(summary.status),
      );
      if (!shouldPoll || isTerminal || document.visibilityState !== "visible") {
        return;
      }
      void fetchSummary();
    };

    window.addEventListener(RUN_SUMMARY_REFRESH_EVENT, handleRefreshEvent);
    return () => {
      window.removeEventListener(RUN_SUMMARY_REFRESH_EVENT, handleRefreshEvent);
    };
  }, [fetchSummary, runId, shouldPoll, summary?.status]);

  return { summary };
}
