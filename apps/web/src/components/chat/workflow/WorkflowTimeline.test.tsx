import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  RUN_EVENT_TYPES,
  RUN_WORKFLOW_STEPS,
  type RunEvent,
} from "@repo/shared-types";
import { WorkflowTimeline } from "./WorkflowTimeline.js";
import type { WorkflowRunSummary } from "../../../services/workflow/WorkflowTimelineViewModel.js";

describe("WorkflowTimeline", () => {
  it("keeps failed tool rows surfaced by default", () => {
    render(
      <WorkflowTimeline
        events={createFailedRunEvents()}
        summary={createSummary(1, 1)}
        isLoading={false}
      />,
    );

    expect(screen.getByRole("button", { name: /tool batch/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: /shell exec/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("Command exited with code 1")).toBeInTheDocument();
  });

  it("supports compaction controls and shows new-event indicators for collapsed blocks", () => {
    const { rerender } = render(
      <WorkflowTimeline
        events={createCompactedEvents(2)}
        summary={createSummary(2, 0)}
        isLoading={false}
      />,
    );

    const blockToggle = screen.getByRole("button", { name: /tool batch/i });
    expect(blockToggle).toHaveAttribute("aria-expanded", "false");

    rerender(
      <WorkflowTimeline
        events={createCompactedEvents(3)}
        summary={createSummary(3, 0)}
        isLoading={false}
      />,
    );

    expect(screen.getByText("+3 new")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByRole("button", { name: /tool batch/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.queryByText("+3 new")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.getByRole("button", { name: /tool batch/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

function createSummary(
  totalTasks: number,
  failedTasks: number,
): WorkflowRunSummary {
  return {
    runId: "run-1",
    status: failedTasks > 0 ? "FAILED" : "COMPLETED",
    totalTasks,
    completedTasks: totalTasks - failedTasks,
    failedTasks,
    eventCount: 0,
    lastEventType:
      failedTasks > 0
        ? RUN_EVENT_TYPES.RUN_FAILED
        : RUN_EVENT_TYPES.RUN_COMPLETED,
  };
}

function createFailedRunEvents(): RunEvent[] {
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
        workflowStep: RUN_WORKFLOW_STEPS.EXECUTION,
        reason: "running tools",
      },
      "2026-03-24T10:00:01.000Z",
    ),
    createRunEvent(
      "evt-3",
      RUN_EVENT_TYPES.TOOL_REQUESTED,
      {
        toolId: "tool-1",
        toolName: "shell_exec",
        arguments: { command: "npm test" },
      },
      "2026-03-24T10:00:02.000Z",
    ),
    createRunEvent(
      "evt-4",
      RUN_EVENT_TYPES.TOOL_STARTED,
      {
        toolId: "tool-1",
        toolName: "shell_exec",
      },
      "2026-03-24T10:00:03.000Z",
    ),
    createRunEvent(
      "evt-5",
      RUN_EVENT_TYPES.TOOL_FAILED,
      {
        toolId: "tool-1",
        toolName: "shell_exec",
        executionTimeMs: 1_500,
        error: "Command exited with code 1",
      },
      "2026-03-24T10:00:04.500Z",
    ),
    createRunEvent(
      "evt-6",
      RUN_EVENT_TYPES.RUN_FAILED,
      {
        status: "failed",
        error: "Execution failed",
        totalDurationMs: 4_500,
      },
      "2026-03-24T10:00:04.500Z",
    ),
  ];
}

function createCompactedEvents(toolCount: number): RunEvent[] {
  const events: RunEvent[] = [
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
        workflowStep: RUN_WORKFLOW_STEPS.EXECUTION,
        reason: "running read-only tools",
      },
      "2026-03-24T10:00:01.000Z",
    ),
  ];

  for (let index = 0; index < toolCount; index += 1) {
    const toolId = `tool-${index + 1}`;
    const baseSecond = index * 3 + 2;
    events.push(
      createRunEvent(
        `evt-requested-${toolId}`,
        RUN_EVENT_TYPES.TOOL_REQUESTED,
        {
          toolId,
          toolName: "read_file",
          arguments: { path: `src/file-${index + 1}.ts` },
        },
        `2026-03-24T10:00:${String(baseSecond).padStart(2, "0")}.000Z`,
      ),
    );
    events.push(
      createRunEvent(
        `evt-started-${toolId}`,
        RUN_EVENT_TYPES.TOOL_STARTED,
        {
          toolId,
          toolName: "read_file",
        },
        `2026-03-24T10:00:${String(baseSecond + 1).padStart(2, "0")}.000Z`,
      ),
    );
    events.push(
      createRunEvent(
        `evt-completed-${toolId}`,
        RUN_EVENT_TYPES.TOOL_COMPLETED,
        {
          toolId,
          toolName: "read_file",
          executionTimeMs: 700,
          result: "small file preview",
        },
        `2026-03-24T10:00:${String(baseSecond + 2).padStart(2, "0")}.000Z`,
      ),
    );
  }

  return events;
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
