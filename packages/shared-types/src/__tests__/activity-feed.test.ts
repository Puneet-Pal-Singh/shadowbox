import { describe, expect, it } from "vitest";
import {
  ACTIVITY_PART_KINDS,
  TOOL_ACTIVITY_FAMILIES,
  isActivityPart,
} from "../activity-feed.js";
import {
  parseActivityFeedSnapshot,
  parseActivityPart,
  safeParseActivityPart,
} from "../activity-feed.zod.js";

describe("activity-feed contract", () => {
  it("parses a shell tool activity part", () => {
    const part = parseActivityPart({
      id: "tool-1",
      runId: "run-1",
      sessionId: "session-1",
      turnId: "turn-1",
      kind: ACTIVITY_PART_KINDS.TOOL,
      createdAt: "2026-03-24T10:00:00.000Z",
      updatedAt: "2026-03-24T10:00:01.000Z",
      source: "brain",
      toolId: "tool-1",
      toolName: "bash",
      status: "completed",
      input: { command: "pnpm test" },
      output: { content: "ok" },
      metadata: {
        family: TOOL_ACTIVITY_FAMILIES.SHELL,
        command: "pnpm test",
        origin: "agent_tool",
        cwd: ".",
        stdout: "ok",
        outputTail: "ok",
        exitCode: 0,
        truncated: false,
      },
      startedAt: "2026-03-24T10:00:00.100Z",
      endedAt: "2026-03-24T10:00:01.000Z",
    });

    expect(part.kind).toBe("tool");
    if (part.kind !== "tool") {
      throw new Error("Expected tool activity part");
    }
    expect(part.metadata.family).toBe("shell");
    expect(isActivityPart(part)).toBe(true);
  });

  it("parses a snapshot with handoff and reasoning items", () => {
    const snapshot = parseActivityFeedSnapshot({
      runId: "run-1",
      sessionId: "session-1",
      status: "COMPLETED",
      items: [
        {
          id: "reasoning-1",
          runId: "run-1",
          sessionId: "session-1",
          turnId: "turn-1",
          kind: ACTIVITY_PART_KINDS.REASONING,
          createdAt: "2026-03-24T10:00:00.000Z",
          updatedAt: "2026-03-24T10:00:00.000Z",
          source: "brain",
          label: "Analyzing repository",
          summary: "Preparing the execution plan.",
          phase: "planning",
          status: "completed",
        },
        {
          id: "handoff-1",
          runId: "run-1",
          sessionId: "session-1",
          turnId: "turn-1",
          kind: ACTIVITY_PART_KINDS.HANDOFF,
          createdAt: "2026-03-24T10:00:01.000Z",
          updatedAt: "2026-03-24T10:00:01.000Z",
          source: "brain",
          targetMode: "build",
          summary: "Switch to build mode.",
          prompt: "Execute the approved plan.",
          status: "ready",
        },
      ],
    });

    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.items[1]?.kind).toBe("handoff");
  });

  it("rejects malformed parts safely", () => {
    const result = safeParseActivityPart({
      id: "broken",
      kind: ACTIVITY_PART_KINDS.TOOL,
    });

    expect(result.success).toBe(false);
  });
});
