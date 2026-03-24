import { safeParseRunEvent, type RunEvent } from "@repo/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { runEventsPath } from "../lib/platform-endpoints.js";
import { RUN_SUMMARY_REFRESH_EVENT } from "../lib/run-summary-events.js";

interface UseRunEventsResult {
  events: RunEvent[];
}

const EVENT_ERROR_LOG_WINDOW_MS = 30_000;
const RUN_EVENTS_MIN_FETCH_INTERVAL_MS = 800;

export function useRunEvents(runId: string): UseRunEventsResult {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const requestIdRef = useRef(0);
  const activeRunIdRef = useRef(runId);
  const missedRefreshRef = useRef(false);
  const lastErrorLogRef = useRef<{
    timestamp: number;
    message: string;
  } | null>(null);

  const fetchEvents = useCallback(
    async (options?: { force?: boolean }) => {
      const currentRunId = runId.trim();
      if (!currentRunId || inFlightRef.current) {
        if (!currentRunId) {
          setEvents([]);
        }
        return;
      }

      const now = Date.now();
      if (
        !options?.force &&
        now - lastFetchAtRef.current < RUN_EVENTS_MIN_FETCH_INTERVAL_MS
      ) {
        return;
      }

      try {
        inFlightRef.current = true;
        lastFetchAtRef.current = now;
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;

        const response = await fetch(runEventsPath(currentRunId));
        if (!response.ok) {
          return;
        }

        const body = await response.text();
        if (
          activeRunIdRef.current !== currentRunId ||
          requestIdRef.current !== requestId
        ) {
          return;
        }
        const parsedEvents = parseNdjsonEvents(body, currentRunId);
        setEvents(parsedEvents);
      } catch (error) {
        if (activeRunIdRef.current === currentRunId) {
          logRunEventsWarning(currentRunId, error, lastErrorLogRef);
        }
      } finally {
        if (activeRunIdRef.current === currentRunId) {
          inFlightRef.current = false;
        }
      }
    },
    [runId],
  );

  useEffect(() => {
    activeRunIdRef.current = runId;
    inFlightRef.current = false;
    lastFetchAtRef.current = 0;
    requestIdRef.current += 1;
    lastErrorLogRef.current = null;
    missedRefreshRef.current = false;

    if (!runId) {
      setEvents([]);
      return;
    }

    setEvents([]);
    void fetchEvents();
  }, [fetchEvents, runId]);

  useEffect(() => {
    if (!runId) {
      return;
    }

    const handleRefreshEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ runId?: string }>;
      if (customEvent.detail?.runId !== runId) {
        return;
      }
      if (document.visibilityState !== "visible") {
        missedRefreshRef.current = true;
        return;
      }
      void fetchEvents({ force: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible" || !missedRefreshRef.current) {
        return;
      }
      missedRefreshRef.current = false;
      void fetchEvents({ force: true });
    };

    window.addEventListener(RUN_SUMMARY_REFRESH_EVENT, handleRefreshEvent);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener(RUN_SUMMARY_REFRESH_EVENT, handleRefreshEvent);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchEvents, runId]);

  return { events };
}

function parseNdjsonEvents(body: string, runId: string): RunEvent[] {
  if (!body.trim()) {
    return [];
  }

  const events: RunEvent[] = [];
  for (const line of body.split("\n")) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }

    const result = safeParseRunEvent(JSON.parse(trimmedLine) as unknown);
    if (!result.success) {
      console.warn(
        `[run/events] dropped invalid event for runId=${runId}: ${result.error}`,
      );
      continue;
    }

    events.push(result.data);
  }

  return events;
}

function logRunEventsWarning(
  runId: string,
  error: unknown,
  lastErrorLogRef: MutableRefObject<{
    timestamp: number;
    message: string;
  } | null>,
): void {
  const message = error instanceof Error ? error.message : String(error);
  const now = Date.now();
  const previous = lastErrorLogRef.current;
  const shouldLog =
    !previous ||
    previous.message !== message ||
    now - previous.timestamp >= EVENT_ERROR_LOG_WINDOW_MS;

  if (!shouldLog) {
    return;
  }

  console.warn(
    `[run/events] failed to fetch events for runId=${runId}: ${message}`,
  );
  lastErrorLogRef.current = {
    timestamp: now,
    message,
  };
}
