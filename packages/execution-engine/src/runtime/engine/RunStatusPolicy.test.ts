import { describe, expect, it } from "vitest";
import { determineRunStatusFromTasks, applyFinalRunStatus } from "./RunStatusPolicy.js";
import { Task } from "../task/index.js";
import { Run } from "../run/index.js";

describe("RunStatusPolicy", () => {
  it("returns RUNNING when any task is not terminal", () => {
    const tasks = [
      new Task("1", "run-1", "shell", "DONE", [], { description: "done" }),
      new Task("2", "run-1", "shell", "READY", [], { description: "ready" }),
    ];

    expect(determineRunStatusFromTasks(tasks)).toBe("RUNNING");
  });

  it("does not force a terminal transition when final status is RUNNING", () => {
    const run = new Run("run-1", "session-1", "RUNNING", "coding", {
      agentType: "coding",
      prompt: "check status",
      sessionId: "session-1",
    });

    applyFinalRunStatus(run, "run-1", "RUNNING", [
      new Task("1", "run-1", "shell", "READY", [], { description: "ready" }),
    ]);

    expect(run.status).toBe("RUNNING");
    expect(run.metadata.completedAt).toBeUndefined();
  });
});
