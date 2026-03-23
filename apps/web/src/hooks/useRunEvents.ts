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
  const lastErrorLogRef = useRef<{
    timestamp: number;
    message: string;
  } | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!runId || inFlightRef.current) {
      if (!runId) {
        setEvents([]);
      }
      return;
    }

    const now = Date.now();
    if (now - lastFetchAtRef.current < RUN_EVENTS_MIN_FETCH_INTERVAL_MS) {
      return;
    }

    try {
      inFlightRef.current = true;
      lastFetchAtRef.current = now;

      const response = await fetch(runEventsPath(runId));
      if (!response.ok) {
        return;
      }

      const body = await response.text();
      const parsedEvents = parseNdjsonEvents(body, runId);
      setEvents(parsedEvents);
    } catch (error) {
      logRunEventsWarning(runId, error, lastErrorLogRef);
    } finally {
      inFlightRef.current = false;
    }
  }, [runId]);

  useEffect(() => {
    if (!runId) {
      setEvents([]);
      return;
    }

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
        return;
      }
      void fetchEvents();
    };

    window.addEventListener(RUN_SUMMARY_REFRESH_EVENT, handleRefreshEvent);
    return () => {
      window.removeEventListener(RUN_SUMMARY_REFRESH_EVENT, handleRefreshEvent);
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
