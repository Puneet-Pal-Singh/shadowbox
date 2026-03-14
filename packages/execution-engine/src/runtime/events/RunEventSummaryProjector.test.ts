import { describe, expect, it } from "vitest";
import {
  createRunCompletedEvent,
  createToolCompletedEvent,
  createToolRequestedEvent,
  createToolStartedEvent,
} from "./RunEventFactory.js";
import { projectRunSummaryFromEvents } from "./RunEventSummaryProjector.js";

describe("RunEventSummaryProjector", () => {
  it("projects summary counts from canonical tool lifecycle events", () => {
    const events = [
      createToolRequestedEvent(baseToolInput("task-1", "read_file"), {
        path: "README.md",
      }),
      createToolStartedEvent(baseToolInput("task-1", "read_file")),
      createToolCompletedEvent(
        baseToolInput("task-1", "read_file"),
        "README contents",
        12,
      ),
      createToolRequestedEvent(baseToolInput("task-2", "run_command"), {
        command: "pnpm test",
      }),
      createToolStartedEvent(baseToolInput("task-2", "run_command")),
      createRunCompletedEvent(baseRunInput(), 40, 2),
    ];

    const summary = projectRunSummaryFromEvents("run-1", "RUNNING", events);

    expect(summary).toEqual({
      runId: "run-1",
      status: "RUNNING",
      totalTasks: 2,
      completedTasks: 1,
      failedTasks: 0,
      runningTasks: 1,
      pendingTasks: 0,
      cancelledTasks: 0,
      eventCount: 6,
      lastEventType: "run.completed",
    });
  });

  it("treats unfinished tools as cancelled when the run is cancelled", () => {
    const events = [
      createToolRequestedEvent(baseToolInput("task-1", "read_file"), {
        path: "README.md",
      }),
      createToolStartedEvent(baseToolInput("task-1", "read_file")),
      createToolRequestedEvent(baseToolInput("task-2", "git_diff"), {}),
    ];

    const summary = projectRunSummaryFromEvents("run-1", "CANCELLED", events);

    expect(summary.cancelledTasks).toBe(2);
    expect(summary.pendingTasks).toBe(0);
    expect(summary.runningTasks).toBe(0);
  });
});

function baseRunInput() {
  return {
    runId: "run-1",
    sessionId: "session-1",
  };
}

function baseToolInput(taskId: string, toolName: string) {
  return {
    ...baseRunInput(),
    taskId,
    toolName,
  };
}
