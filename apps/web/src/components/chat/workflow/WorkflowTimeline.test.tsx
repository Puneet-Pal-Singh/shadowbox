import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

    expect(
      screen.getByRole("button", { name: /thinking/i }),
    ).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByRole("button", { name: /ran npm test/i }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Command exited with code 1")).toBeInTheDocument();
    expect(screen.getByText("Shell")).toBeInTheDocument();
  });

  it("renders exploration batches as compact non-expandable status rows", () => {
    const { rerender } = render(
      <WorkflowTimeline
        events={createCompactedEvents(2)}
        summary={createSummary(2, 0)}
        isLoading={false}
      />,
    );

    expect(screen.getByText("Explored 2 files")).toBeInTheDocument();
    expect(screen.getByText("Read src/file-2.ts")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /explored.*2 files/i }),
    ).not.toBeInTheDocument();

    rerender(
      <WorkflowTimeline
        events={createCompactedEvents(3)}
        summary={createSummary(3, 0)}
        isLoading={false}
      />,
    );

    expect(screen.getByText("+3 new")).toBeInTheDocument();
  });

  it("keeps bash-backed thinking blocks expandable like shell rows", () => {
    render(
      <WorkflowTimeline
        events={createBashThinkingEvents()}
        summary={createSummary(1, 0)}
        isLoading={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: /thinking/i }),
    ).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: /thinking/i }));
    expect(
      screen.getByRole("button", { name: /ran git status/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Shell")).toBeInTheDocument();
  });

  it("shows a first-class plan handoff action when one is available", () => {
    const onUsePlanInBuild = vi.fn();

    render(
      <WorkflowTimeline
        events={[]}
        summary={{
          ...createSummary(0, 0),
          planArtifact: {
            handoff: {
              targetMode: "build",
              summary: "Move to build with the approved handoff prompt.",
              prompt: "Execute this approved plan in build mode.",
            },
          },
        }}
        isLoading={false}
        onUsePlanInBuild={onUsePlanInBuild}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Execute Plan in Build" }),
    );

    expect(onUsePlanInBuild).toHaveBeenCalledTimes(1);
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

function createBashThinkingEvents(): RunEvent[] {
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
      RUN_EVENT_TYPES.RUN_PROGRESS,
      {
        phase: RUN_WORKFLOW_STEPS.EXECUTION,
        label: "Thinking",
        summary: "",
        status: "active",
      },
      "2026-03-24T10:00:01.000Z",
    ),
    createRunEvent(
      "evt-3",
      RUN_EVENT_TYPES.TOOL_REQUESTED,
      {
        toolId: "tool-1",
        toolName: "bash",
        arguments: { command: "git status" },
        displayText: "Running git status",
      },
      "2026-03-24T10:00:02.000Z",
    ),
    createRunEvent(
      "evt-4",
      RUN_EVENT_TYPES.TOOL_STARTED,
      {
        toolId: "tool-1",
        toolName: "bash",
      },
      "2026-03-24T10:00:03.000Z",
    ),
    createRunEvent(
      "evt-5",
      RUN_EVENT_TYPES.TOOL_OUTPUT_APPENDED,
      {
        toolId: "tool-1",
        toolName: "bash",
        stdoutDelta: "$ git status\nOn branch feat/example\n",
      },
      "2026-03-24T10:00:03.500Z",
    ),
    createRunEvent(
      "evt-6",
      RUN_EVENT_TYPES.TOOL_COMPLETED,
      {
        toolId: "tool-1",
        toolName: "bash",
        executionTimeMs: 800,
        result: "On branch feat/example",
      },
      "2026-03-24T10:00:04.000Z",
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
