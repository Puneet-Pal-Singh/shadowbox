import { describe, expect, it } from "vitest";
import {
  ACTIVITY_PART_KINDS,
  TOOL_ACTIVITY_FAMILIES,
  type ActivityFeedSnapshot,
} from "@repo/shared-types";
import { buildActivityFeedViewModel } from "./ActivityFeedViewModel.js";

describe("ActivityFeedViewModel", () => {
  it("groups low-noise exploration actions and keeps shell rows visible", () => {
    const viewModel = buildActivityFeedViewModel(createFeedSnapshot());
    expect(viewModel.turns).toHaveLength(1);
    expect(viewModel.turns[0]?.rows[1]?.kind).toBe("group");
    expect(viewModel.turns[0]?.rows[2]?.kind).toBe("tool");
    if (viewModel.turns[0]?.rows[2]?.kind === "tool") {
      expect(viewModel.turns[0].rows[2].family).toBe(
        TOOL_ACTIVITY_FAMILIES.SHELL,
      );
    }
  });
});

function createFeedSnapshot(): ActivityFeedSnapshot {
  return {
    runId: "run-1",
    sessionId: "session-1",
    status: "RUNNING",
    items: [
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
        content: "Inspect the app and run tests.",
      },
      {
        id: "tool-1",
        runId: "run-1",
        sessionId: "session-1",
        turnId: "turn-1",
        kind: ACTIVITY_PART_KINDS.TOOL,
        createdAt: "2026-03-24T10:00:01.000Z",
        updatedAt: "2026-03-24T10:00:01.000Z",
        source: "brain",
        toolId: "tool-1",
        toolName: "list_files",
        status: "completed",
        metadata: {
          family: TOOL_ACTIVITY_FAMILIES.READ,
          count: 3,
          truncated: false,
          preview: "src\nREADME.md",
          loadedPaths: ["."],
          path: ".",
        },
      },
      {
        id: "tool-2",
        runId: "run-1",
        sessionId: "session-1",
        turnId: "turn-1",
        kind: ACTIVITY_PART_KINDS.TOOL,
        createdAt: "2026-03-24T10:00:02.000Z",
        updatedAt: "2026-03-24T10:00:02.000Z",
        source: "brain",
        toolId: "tool-2",
        toolName: "read_file",
        status: "completed",
        metadata: {
          family: TOOL_ACTIVITY_FAMILIES.READ,
          count: 1,
          truncated: false,
          preview: "content",
          loadedPaths: ["README.md"],
          path: "README.md",
        },
      },
      {
        id: "tool-3",
        runId: "run-1",
        sessionId: "session-1",
        turnId: "turn-1",
        kind: ACTIVITY_PART_KINDS.TOOL,
        createdAt: "2026-03-24T10:00:03.000Z",
        updatedAt: "2026-03-24T10:00:03.000Z",
        source: "brain",
        toolId: "tool-3",
        toolName: "run_command",
        status: "completed",
        metadata: {
          family: TOOL_ACTIVITY_FAMILIES.SHELL,
          command: "pnpm test",
          cwd: ".",
          stdout: "ok",
          exitCode: 0,
        },
      },
    ],
  };
}
