import { describe, expect, it } from "vitest";
import {
  ACTIVITY_PART_KINDS,
  RUN_EVENT_TYPES,
  TOOL_ACTIVITY_FAMILIES,
  type RunEvent,
} from "@repo/shared-types";
import { projectRunActivityFeed } from "./RunActivityFeedProjector.js";

describe("RunActivityFeedProjector", () => {
  it("projects reasoning, shell tool, approval, and handoff activity parts", () => {
    const snapshot = projectRunActivityFeed({
      runId: "run-1",
      run: {
        id: "run-1",
        sessionId: "session-1",
        status: "COMPLETED",
        metadata: {
          prompt: "Run tests",
          completedAt: "2026-03-24T10:00:03.000Z",
          lifecycleSteps: [
            {
              step: "APPROVAL_WAIT",
              recordedAt: "2026-03-24T10:00:02.000Z",
              detail: "platform approval required",
            },
          ],
          planArtifact: {
            id: "run-1:plan",
            createdAt: "2026-03-24T10:00:04.000Z",
            summary: "Build after review.",
            estimatedSteps: 1,
            tasks: [],
            handoff: {
              targetMode: "build",
              summary: "Switch to build mode.",
              prompt: "Execute the approved plan.",
            },
          },
        },
      },
      events: [
        createEvent(RUN_EVENT_TYPES.MESSAGE_EMITTED, {
          content: "Run tests",
          role: "user",
        }),
        createEvent(RUN_EVENT_TYPES.RUN_STATUS_CHANGED, {
          previousStatus: "queued",
          newStatus: "running",
          workflowStep: "execution",
        }),
        createEvent(RUN_EVENT_TYPES.TOOL_REQUESTED, {
          toolId: "tool-1",
          toolName: "run_command",
          arguments: { command: "pnpm test" },
        }),
        createEvent(RUN_EVENT_TYPES.TOOL_COMPLETED, {
          toolId: "tool-1",
          toolName: "run_command",
          executionTimeMs: 1200,
          result: { content: "ok" },
        }),
      ],
    });

    expect(
      snapshot.items.some((item) => item.kind === ACTIVITY_PART_KINDS.TEXT),
    ).toBe(true);
    const reasoning = snapshot.items.find(
      (item) => item.kind === ACTIVITY_PART_KINDS.REASONING,
    );
    expect(reasoning?.kind).toBe("reasoning");

    const tool = snapshot.items.find(
      (item) => item.kind === ACTIVITY_PART_KINDS.TOOL,
    );
    expect(tool?.kind).toBe("tool");
    if (tool?.kind === "tool") {
      expect(tool.metadata.family).toBe(TOOL_ACTIVITY_FAMILIES.SHELL);
      expect(tool.status).toBe("completed");
    }

    expect(
      snapshot.items.some((item) => item.kind === ACTIVITY_PART_KINDS.APPROVAL),
    ).toBe(true);
    expect(
      snapshot.items.some((item) => item.kind === ACTIVITY_PART_KINDS.HANDOFF),
    ).toBe(true);
  });
});

function createEvent<T extends RunEvent["type"]>(
  type: T,
  payload: Extract<RunEvent, { type: T }>["payload"],
): Extract<RunEvent, { type: T }> {
  return {
    version: 1,
    eventId: `${type}-event`,
    runId: "run-1",
    sessionId: "session-1",
    timestamp: "2026-03-24T10:00:00.000Z",
    source: "brain",
    type,
    payload,
  } as Extract<RunEvent, { type: T }>;
}
