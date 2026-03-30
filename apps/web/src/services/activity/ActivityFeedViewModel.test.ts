import { describe, expect, it, vi } from "vitest";
import {
  ACTIVITY_PART_KINDS,
  TOOL_ACTIVITY_FAMILIES,
  type ActivityFeedSnapshot,
} from "@repo/shared-types";
import { buildActivityFeedViewModel } from "./ActivityFeedViewModel.js";

describe("ActivityFeedViewModel", () => {
  it("groups low-noise exploration actions and builds collapsed turn summaries", () => {
    const viewModel = buildActivityFeedViewModel(createFeedSnapshot());
    expect(viewModel.turns).toHaveLength(1);
    expect(viewModel.turns[0]?.summaryLabel).toBe(
      "3 tool calls · 1 progress update",
    );
    expect(viewModel.turns[0]?.defaultCollapsed).toBe(false);
    expect(viewModel.turns[0]?.isActiveTurn).toBe(true);
    expect(viewModel.turns[0]?.rows[0]).toMatchObject({
      kind: "reasoning",
      label: "Analyzing request",
    });
    expect(viewModel.turns[0]?.rows[1]?.kind).toBe("group");
    expect(viewModel.turns[0]?.rows[1]).toMatchObject({
      kind: "group",
      title: "Explored",
      summary: "1 list, 1 file",
    });
    expect(viewModel.turns[0]?.rows[2]?.kind).toBe("tool");
    if (viewModel.turns[0]?.rows[2]?.kind === "tool") {
      expect(viewModel.turns[0].rows[2].family).toBe(
        TOOL_ACTIVITY_FAMILIES.SHELL,
      );
    }
  });

  it("marks completed turns as non-active and collapsed by default", () => {
    const viewModel = buildActivityFeedViewModel({
      ...createFeedSnapshot(),
      status: "COMPLETED",
    });

    expect(viewModel.turns[0]?.isActiveTurn).toBe(false);
    expect(viewModel.turns[0]?.defaultCollapsed).toBe(true);
  });

  it("labels active read batches with specific progress copy", () => {
    const snapshot = createFeedSnapshot();
    const runningTool = snapshot.items[3];
    if (!runningTool || runningTool.kind !== ACTIVITY_PART_KINDS.TOOL) {
      throw new Error("Expected a tool activity fixture.");
    }
    const viewModel = buildActivityFeedViewModel({
      ...snapshot,
      items: [
        snapshot.items[0]!,
        snapshot.items[1]!,
        snapshot.items[2]!,
        {
          ...runningTool,
          id: "tool-2-running",
          status: "running",
          updatedAt: "2026-03-24T10:00:02.500Z",
        },
      ],
    });

    expect(viewModel.turns[0]?.rows[1]).toMatchObject({
      kind: "group",
      title: "Exploring",
      summary: "1 list, 1 file",
      status: "running",
      defaultCollapsed: false,
    });
  });

  it("turns generic execution progress into a compact thinking row and suppresses generic synthesis rows", () => {
    const snapshot = createFeedSnapshot();
    const viewModel = buildActivityFeedViewModel({
      ...snapshot,
      items: [
        ...snapshot.items,
        {
          id: "reasoning-execution",
          runId: "run-1",
          sessionId: "session-1",
          turnId: "turn-1",
          kind: ACTIVITY_PART_KINDS.REASONING,
          createdAt: "2026-03-24T10:00:04.000Z",
          updatedAt: "2026-03-24T10:00:04.000Z",
          source: "brain",
          label: "Executing tools",
          summary: "Running the selected coding tools.",
          phase: "execution",
          status: "completed",
        },
        {
          id: "reasoning-synthesis",
          runId: "run-1",
          sessionId: "session-1",
          turnId: "turn-1",
          kind: ACTIVITY_PART_KINDS.REASONING,
          createdAt: "2026-03-24T10:00:05.000Z",
          updatedAt: "2026-03-24T10:00:05.000Z",
          source: "brain",
          label: "Preparing final answer",
          summary: "Summarizing execution results for the final response.",
          phase: "synthesis",
          status: "completed",
        },
      ],
    });

    expect(
      viewModel.turns[0]?.rows.some(
        (row) => row.kind === "reasoning" && row.label === "Thinking",
      ),
    ).toBe(false);
    expect(
      viewModel.turns[0]?.rows.some(
        (row) =>
          row.kind === "reasoning" &&
          row.summary ===
            "Summarizing execution results for the final response.",
      ),
    ).toBe(false);
  });

  it("keeps explicit execution progress rows and recovery-coded assistant messages visible", () => {
    const viewModel = buildActivityFeedViewModel({
      runId: "run-progress",
      sessionId: "session-progress",
      status: "COMPLETED",
      items: [
        {
          id: "text-user",
          runId: "run-progress",
          sessionId: "session-progress",
          turnId: "turn-1",
          kind: ACTIVITY_PART_KINDS.TEXT,
          createdAt: "2026-03-24T10:00:00.000Z",
          updatedAt: "2026-03-24T10:00:00.000Z",
          source: "brain",
          role: "user",
          content: "update the footer",
        },
        {
          id: "reasoning-progress",
          runId: "run-progress",
          sessionId: "session-progress",
          turnId: "turn-1",
          kind: ACTIVITY_PART_KINDS.REASONING,
          createdAt: "2026-03-24T10:00:01.000Z",
          updatedAt: "2026-03-24T10:00:01.000Z",
          source: "brain",
          label: "Corrective retry",
          summary: "No file changed yet. Requesting one concrete mutation.",
          phase: "execution",
          status: "active",
        },
        {
          id: "text-assistant",
          runId: "run-progress",
          sessionId: "session-progress",
          turnId: "turn-1",
          kind: ACTIVITY_PART_KINDS.TEXT,
          createdAt: "2026-03-24T10:00:02.000Z",
          updatedAt: "2026-03-24T10:00:02.000Z",
          source: "brain",
          role: "assistant",
          content: "No file was changed before the timeout.",
          metadata: {
            code: "TASK_EXECUTION_TIMEOUT",
            retryable: true,
            resumeHint: "Retry the task or switch models.",
          },
        },
      ],
    });

    expect(
      viewModel.turns[0]?.rows.some(
        (row) =>
          row.kind === "reasoning" &&
          row.summary ===
            "No file changed yet. Requesting one concrete mutation.",
      ),
    ).toBe(true);
    expect(
      viewModel.turns[0]?.rows.some(
        (row) =>
          row.kind === "text" &&
          row.metadata?.code === "TASK_EXECUTION_TIMEOUT",
      ),
    ).toBe(true);
  });

  it("keeps plain assistant transcript messages out of the activity feed", () => {
    const viewModel = buildActivityFeedViewModel({
      runId: "run-plain-assistant",
      sessionId: "session-plain-assistant",
      status: "COMPLETED",
      items: [
        {
          id: "text-user",
          runId: "run-plain-assistant",
          sessionId: "session-plain-assistant",
          turnId: "turn-1",
          kind: ACTIVITY_PART_KINDS.TEXT,
          createdAt: "2026-03-24T10:00:00.000Z",
          updatedAt: "2026-03-24T10:00:00.000Z",
          source: "brain",
          role: "user",
          content: "update the footer",
        },
        {
          id: "text-assistant",
          runId: "run-plain-assistant",
          sessionId: "session-plain-assistant",
          turnId: "turn-1",
          kind: ACTIVITY_PART_KINDS.TEXT,
          createdAt: "2026-03-24T10:00:01.000Z",
          updatedAt: "2026-03-24T10:00:01.000Z",
          source: "brain",
          role: "assistant",
          content: "I updated the footer and added the CTA.",
        },
      ],
    });

    expect(viewModel.turns[0]?.rows.some((row) => row.kind === "text")).toBe(
      false,
    );
  });

  it("formats git status activity like a command transcript", () => {
    const viewModel = buildActivityFeedViewModel({
      runId: "run-2",
      sessionId: "session-2",
      status: "COMPLETED",
      items: [
        {
          id: "text-1",
          runId: "run-2",
          sessionId: "session-2",
          turnId: "turn-1",
          kind: ACTIVITY_PART_KINDS.TEXT,
          createdAt: "2026-03-24T10:00:00.000Z",
          updatedAt: "2026-03-24T10:00:00.000Z",
          source: "brain",
          role: "user",
          content: "check my git info",
        },
        {
          id: "tool-1",
          runId: "run-2",
          sessionId: "session-2",
          turnId: "turn-1",
          kind: ACTIVITY_PART_KINDS.TOOL,
          createdAt: "2026-03-24T10:00:01.000Z",
          updatedAt: "2026-03-24T10:00:02.000Z",
          source: "brain",
          toolId: "tool-1",
          toolName: "git_status",
          status: "completed",
          metadata: {
            family: TOOL_ACTIVITY_FAMILIES.GIT,
            preview:
              '{"files":[],"ahead":0,"behind":0,"branch":"main","hasStaged":false,"hasUnstaged":false,"gitAvailable":true}',
          },
        },
      ],
    });

    const gitRow = viewModel.turns[0]?.rows[0];
    expect(gitRow).toMatchObject({
      kind: "tool",
      title: "git status",
      summary: "On main · working tree clean",
      defaultCollapsed: false,
    });

    if (gitRow?.kind === "tool") {
      expect(gitRow.details[0]).toContain("$ git status");
      expect(gitRow.details[0]).toContain("On branch main");
      expect(gitRow.details[0]).toContain("Working tree clean.");
    }
  });

  it("skips activity turns that are missing a canonical turn id", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const viewModel = buildActivityFeedViewModel({
      runId: "run-invalid",
      sessionId: "session-invalid",
      status: "COMPLETED",
      items: [
        {
          id: "tool-1",
          runId: "run-invalid",
          sessionId: "session-invalid",
          kind: ACTIVITY_PART_KINDS.TOOL,
          createdAt: "2026-03-24T10:00:01.000Z",
          updatedAt: "2026-03-24T10:00:02.000Z",
          source: "brain",
          toolId: "tool-1",
          toolName: "git_status",
          status: "completed",
          metadata: {
            family: TOOL_ACTIVITY_FAMILIES.GIT,
            preview:
              '{"files":[],"ahead":0,"behind":0,"branch":"main","hasStaged":false,"hasUnstaged":false,"gitAvailable":true}',
          },
        },
      ],
    });

    expect(viewModel.turns).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      "[activity/feed] Skipping activity turn without canonical turnId.",
      { index: 0 },
    );

    warnSpy.mockRestore();
  });

  it("falls back to raw git preview when status files are malformed", () => {
    const viewModel = buildActivityFeedViewModel({
      runId: "run-git-invalid",
      sessionId: "session-git-invalid",
      status: "COMPLETED",
      items: [
        {
          id: "text-1",
          runId: "run-git-invalid",
          sessionId: "session-git-invalid",
          turnId: "turn-1",
          kind: ACTIVITY_PART_KINDS.TEXT,
          createdAt: "2026-03-24T10:00:00.000Z",
          updatedAt: "2026-03-24T10:00:00.000Z",
          source: "brain",
          role: "user",
          content: "check git",
        },
        {
          id: "tool-1",
          runId: "run-git-invalid",
          sessionId: "session-git-invalid",
          turnId: "turn-1",
          kind: ACTIVITY_PART_KINDS.TOOL,
          createdAt: "2026-03-24T10:00:01.000Z",
          updatedAt: "2026-03-24T10:00:02.000Z",
          source: "brain",
          toolId: "tool-1",
          toolName: "git_status",
          status: "completed",
          metadata: {
            family: TOOL_ACTIVITY_FAMILIES.GIT,
            preview:
              '{"files":[{"oops":true}],"ahead":0,"behind":0,"branch":"main","hasStaged":false,"hasUnstaged":false,"gitAvailable":true}',
          },
        },
      ],
    });

    const gitRow = viewModel.turns[0]?.rows[0];
    expect(gitRow).toMatchObject({
      kind: "tool",
      title: "git status",
      summary: "",
    });
    if (gitRow?.kind === "tool") {
      expect(gitRow.details[0]).toContain('"oops":true');
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
        id: "reasoning-1",
        runId: "run-1",
        sessionId: "session-1",
        turnId: "turn-1",
        kind: ACTIVITY_PART_KINDS.REASONING,
        createdAt: "2026-03-24T10:00:00.500Z",
        updatedAt: "2026-03-24T10:00:00.500Z",
        source: "brain",
        label: "Analyzing request",
        summary: "Checking the repository before editing.",
        phase: "planning",
        status: "completed",
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
        toolName: "bash",
        status: "completed",
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
      },
    ],
  };
}
