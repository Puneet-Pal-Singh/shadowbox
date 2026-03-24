import { describe, expect, it } from "vitest";
import {
  RUN_EVENT_TYPES,
  RUN_WORKFLOW_STEPS,
  type RunEvent,
} from "@repo/shared-types";
import {
  buildWorkflowTimelineViewModel,
  type WorkflowRunSummary,
} from "./WorkflowTimelineViewModel.js";

describe("WorkflowTimelineViewModel", () => {
  it("builds deterministic summary-first blocks from canonical events", () => {
    const events = createCanonicalRunEvents();
    const summary: WorkflowRunSummary = {
      runId: "run-1",
      status: "COMPLETED",
      totalTasks: 2,
      completedTasks: 1,
      failedTasks: 1,
      eventCount: events.length,
      lastEventType: RUN_EVENT_TYPES.RUN_COMPLETED,
    };

    const first = buildWorkflowTimelineViewModel({ events, summary });
    const second = buildWorkflowTimelineViewModel({ events, summary });

    expect(first).toEqual(second);
    expect(first.summary.elapsedLabel).toBe("Worked for 12s");
    expect(first.summary.totalToolCalls).toBe(2);
    expect(first.summary.failuresLabel).toBe("1 failure");
    expect(first.summary.approvalsLabel).toBeUndefined();
    expect(first.summary.agentLabel).toBeUndefined();
    expect(first.blocks.map((block) => block.kind)).toEqual([
      "plan",
      "tool_batch",
      "synthesis",
      "final",
    ]);

    const toolBatch = first.blocks.find((block) => block.kind === "tool_batch");
    expect(toolBatch?.summary).toBe("1 failed, 1 completed");
    expect(toolBatch?.defaultCollapsed).toBe(false);

    const readFileRow = toolBatch?.rows.find(
      (row) => row.kind === "tool" && row.toolName === "read_file",
    );
    const shellRow = toolBatch?.rows.find(
      (row) => row.kind === "tool" && row.toolName === "shell_exec",
    );

    expect(
      readFileRow &&
        readFileRow.kind === "tool" &&
        readFileRow.defaultCollapsed,
    ).toBe(true);
    expect(
      shellRow && shellRow.kind === "tool" && shellRow.defaultCollapsed,
    ).toBe(false);
  });

  it("reuses the existing final block when assistant output arrives before terminal completion", () => {
    const viewModel = buildWorkflowTimelineViewModel({
      events: [
        createRunEvent(
          "evt-1",
          RUN_EVENT_TYPES.MESSAGE_EMITTED,
          {
            role: "assistant",
            content: "Final summary preview.",
          },
          "2026-03-24T10:00:01.000Z",
        ),
        createRunEvent(
          "evt-2",
          RUN_EVENT_TYPES.RUN_COMPLETED,
          {
            status: "complete",
            totalDurationMs: 2_000,
            toolsUsed: 0,
          },
          "2026-03-24T10:00:02.000Z",
        ),
      ],
      summary: {
        runId: "run-1",
        status: "COMPLETED",
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
      },
    });

    expect(
      viewModel.blocks.filter((block) => block.kind === "final"),
    ).toHaveLength(1);
    expect(viewModel.blocks[0]?.rows).toHaveLength(2);
  });

  it("surfaces queued tool batches without claiming they completed", () => {
    const viewModel = buildWorkflowTimelineViewModel({
      events: [
        createRunEvent(
          "evt-1",
          RUN_EVENT_TYPES.RUN_STATUS_CHANGED,
          {
            previousStatus: "queued",
            newStatus: "running",
            workflowStep: RUN_WORKFLOW_STEPS.EXECUTION,
            reason: "starting tools",
          },
          "2026-03-24T10:00:01.000Z",
        ),
        createRunEvent(
          "evt-2",
          RUN_EVENT_TYPES.TOOL_REQUESTED,
          {
            toolId: "tool-1",
            toolName: "read_file",
            arguments: { path: "README.md" },
          },
          "2026-03-24T10:00:02.000Z",
        ),
      ],
      summary: {
        runId: "run-1",
        status: "RUNNING",
        totalTasks: 1,
        completedTasks: 0,
        failedTasks: 0,
      },
    });

    const batch = viewModel.blocks.find((block) => block.kind === "tool_batch");
    expect(batch?.summary).toBe("1 queued");
  });
});

function createCanonicalRunEvents(): RunEvent[] {
  return [
    createRunEvent(
      "evt-1",
      RUN_EVENT_TYPES.RUN_STARTED,
      {
        status: "running",
      },
      "2026-03-24T10:00:00.000Z",
    ),
    createRunEvent(
      "evt-2",
      RUN_EVENT_TYPES.RUN_STATUS_CHANGED,
      {
        previousStatus: "queued",
        newStatus: "running",
        workflowStep: RUN_WORKFLOW_STEPS.PLANNING,
        reason: "prepare the implementation plan",
      },
      "2026-03-24T10:00:01.000Z",
    ),
    createRunEvent(
      "evt-3",
      RUN_EVENT_TYPES.MESSAGE_EMITTED,
      {
        role: "user",
        content: "Update the workflow UI.",
      },
      "2026-03-24T10:00:02.000Z",
    ),
    createRunEvent(
      "evt-4",
      RUN_EVENT_TYPES.RUN_STATUS_CHANGED,
      {
        previousStatus: "running",
        newStatus: "running",
        workflowStep: RUN_WORKFLOW_STEPS.EXECUTION,
        reason: "starting tools",
      },
      "2026-03-24T10:00:03.000Z",
    ),
    createRunEvent(
      "evt-5",
      RUN_EVENT_TYPES.TOOL_REQUESTED,
      {
        toolId: "tool-1",
        toolName: "read_file",
        arguments: { path: "README.md" },
      },
      "2026-03-24T10:00:04.000Z",
    ),
    createRunEvent(
      "evt-6",
      RUN_EVENT_TYPES.TOOL_STARTED,
      {
        toolId: "tool-1",
        toolName: "read_file",
      },
      "2026-03-24T10:00:05.000Z",
    ),
    createRunEvent(
      "evt-7",
      RUN_EVENT_TYPES.TOOL_COMPLETED,
      {
        toolId: "tool-1",
        toolName: "read_file",
        executionTimeMs: 1_000,
        result: "README short result",
      },
      "2026-03-24T10:00:06.000Z",
    ),
    createRunEvent(
      "evt-8",
      RUN_EVENT_TYPES.TOOL_REQUESTED,
      {
        toolId: "tool-2",
        toolName: "shell_exec",
        arguments: { command: "npm test" },
      },
      "2026-03-24T10:00:07.000Z",
    ),
    createRunEvent(
      "evt-9",
      RUN_EVENT_TYPES.TOOL_STARTED,
      {
        toolId: "tool-2",
        toolName: "shell_exec",
      },
      "2026-03-24T10:00:08.000Z",
    ),
    createRunEvent(
      "evt-10",
      RUN_EVENT_TYPES.TOOL_FAILED,
      {
        toolId: "tool-2",
        toolName: "shell_exec",
        executionTimeMs: 2_000,
        error: "Command exited with code 1",
      },
      "2026-03-24T10:00:10.000Z",
    ),
    createRunEvent(
      "evt-11",
      RUN_EVENT_TYPES.RUN_STATUS_CHANGED,
      {
        previousStatus: "running",
        newStatus: "running",
        workflowStep: RUN_WORKFLOW_STEPS.SYNTHESIS,
        reason: "summarizing results",
      },
      "2026-03-24T10:00:11.000Z",
    ),
    createRunEvent(
      "evt-12",
      RUN_EVENT_TYPES.MESSAGE_EMITTED,
      {
        role: "assistant",
        content: "I found the relevant execution details.",
      },
      "2026-03-24T10:00:11.500Z",
    ),
    createRunEvent(
      "evt-13",
      RUN_EVENT_TYPES.RUN_COMPLETED,
      {
        status: "complete",
        totalDurationMs: 12_000,
        toolsUsed: 2,
      },
      "2026-03-24T10:00:12.000Z",
    ),
  ];
}

function createRunEvent<T extends RunEvent["type"]>(
  eventId: string,
  type: T,
  payload: Extract<RunEvent, { type: T }>["payload"],
  timestamp: string,
): Extract<RunEvent, { type: T }> {
  return {
    version: 1,
    eventId,
    runId: "run-1",
    sessionId: "session-1",
    timestamp,
    source: "brain",
    type,
    payload,
  } as Extract<RunEvent, { type: T }>;
}
