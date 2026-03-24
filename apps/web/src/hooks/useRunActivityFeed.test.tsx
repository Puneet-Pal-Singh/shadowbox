import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVITY_PART_KINDS } from "@repo/shared-types";
import { RUN_SUMMARY_REFRESH_EVENT } from "../lib/run-summary-events.js";
import { useRunActivityFeed } from "./useRunActivityFeed.js";

vi.mock("../lib/platform-endpoints.js", () => ({
  runActivityPath: (runId: string) =>
    `https://brain.local/activity?runId=${encodeURIComponent(runId)}`,
}));

describe("useRunActivityFeed", () => {
  const originalVisibilityState = document.visibilityState;

  beforeEach(() => {
    vi.restoreAllMocks();
    setVisibilityState("visible");
  });

  afterEach(() => {
    setVisibilityState(originalVisibilityState);
  });

  it("hydrates the activity feed and refreshes through the runtime bridge", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        createResponse([
          {
            id: "text-1",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-1",
            kind: ACTIVITY_PART_KINDS.TEXT,
            createdAt: "2026-03-24T10:00:00.000Z",
            updatedAt: "2026-03-24T10:00:00.000Z",
            source: "brain",
            role: "user",
            content: "Inspect the app.",
          },
        ]),
      )
      .mockResolvedValueOnce(
        createResponse([
          {
            id: "text-1",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-1",
            kind: ACTIVITY_PART_KINDS.TEXT,
            createdAt: "2026-03-24T10:00:00.000Z",
            updatedAt: "2026-03-24T10:00:00.000Z",
            source: "brain",
            role: "user",
            content: "Inspect the app.",
          },
          {
            id: "reasoning-1",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-1",
            kind: ACTIVITY_PART_KINDS.REASONING,
            createdAt: "2026-03-24T10:00:01.000Z",
            updatedAt: "2026-03-24T10:00:01.000Z",
            source: "brain",
            label: "Analyzing repository",
            summary: "Preparing the plan.",
            phase: "planning",
            status: "completed",
          },
        ]),
      );

    const { result } = renderHook(() => useRunActivityFeed("run-1", true));

    await waitFor(() => {
      expect(result.current.feed?.items).toHaveLength(1);
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(RUN_SUMMARY_REFRESH_EVENT, {
          detail: { runId: "run-1" },
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.feed?.items).toHaveLength(2);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

function createResponse(items: unknown[]): Response {
  return new Response(
    JSON.stringify({
      runId: "run-1",
      sessionId: "session-1",
      status: "RUNNING",
      items,
    }),
    { status: 200 },
  );
}

function setVisibilityState(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
}
