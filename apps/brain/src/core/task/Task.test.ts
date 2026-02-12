// apps/brain/src/core/task/Task.test.ts
// Phase 3A: Unit tests for Task entity

import { describe, it, expect } from "vitest";
import { Task, InvalidTaskStateTransitionError } from "./Task";
import type { TaskInput } from "../../types";

describe("Task", () => {
  const mockInput: TaskInput = {
    description: "Test task",
    expectedOutput: "Test output",
  };

  describe("constructor", () => {
    it("should create a task with default values", () => {
      const task = new Task(
        "task-1",
        "run-1",
        "shell",
        "PENDING",
        [],
        mockInput,
      );

      expect(task.id).toBe("task-1");
      expect(task.runId).toBe("run-1");
      expect(task.type).toBe("shell");
      expect(task.status).toBe("PENDING");
      expect(task.retryCount).toBe(0);
      expect(task.maxRetries).toBe(3);
    });

    it("should accept custom retry settings", () => {
      const task = new Task(
        "task-1",
        "run-1",
        "shell",
        "PENDING",
        [],
        mockInput,
        undefined,
        undefined,
        0,
        5,
      );

      expect(task.maxRetries).toBe(5);
    });
  });

  describe("transition", () => {
    it("should transition from PENDING to READY", () => {
      const task = new Task(
        "task-1",
        "run-1",
        "shell",
        "PENDING",
        [],
        mockInput,
      );
      task.transition("READY");
      expect(task.status).toBe("READY");
    });

    it("should transition through execution states", () => {
      const task = new Task(
        "task-1",
        "run-1",
        "shell",
        "PENDING",
        [],
        mockInput,
      );

      task.transition("READY");
      task.transition("RUNNING");
      task.transition("DONE");

      expect(task.status).toBe("DONE");
    });

    it("should throw on invalid transition", () => {
      const task = new Task(
        "task-1",
        "run-1",
        "shell",
        "PENDING",
        [],
        mockInput,
      );

      expect(() => task.transition("DONE")).toThrow(
        InvalidTaskStateTransitionError,
      );
    });

    it("should update data during transition", () => {
      const task = new Task(
        "task-1",
        "run-1",
        "shell",
        "RUNNING",
        [],
        mockInput,
      );

      task.transition("DONE", {
        output: { content: "Result" },
      });

      expect(task.status).toBe("DONE");
      expect(task.output?.content).toBe("Result");
    });
  });

  describe("canRetry", () => {
    it("should return true when retry count is below max", () => {
      const task = new Task(
        "task-1",
        "run-1",
        "shell",
        "FAILED",
        [],
        mockInput,
        undefined,
        undefined,
        1,
        3,
      );

      expect(task.canRetry()).toBe(true);
    });

    it("should return false when max retries reached", () => {
      const task = new Task(
        "task-1",
        "run-1",
        "shell",
        "FAILED",
        [],
        mockInput,
        undefined,
        undefined,
        3,
        3,
      );

      expect(task.canRetry()).toBe(false);
    });

    it("should return false when not in FAILED state", () => {
      const task = new Task(
        "task-1",
        "run-1",
        "shell",
        "RUNNING",
        [],
        mockInput,
      );

      expect(task.canRetry()).toBe(false);
    });
  });

  describe("incrementRetry", () => {
    it("should increment retry count", () => {
      const task = new Task(
        "task-1",
        "run-1",
        "shell",
        "FAILED",
        [],
        mockInput,
      );

      task.incrementRetry();

      expect(task.retryCount).toBe(1);
    });
  });

  describe("isReady", () => {
    it("should return true for READY status", () => {
      const task = new Task("task-1", "run-1", "shell", "READY", [], mockInput);
      expect(task.isReady()).toBe(true);
    });

    it("should return true for PENDING with no dependencies", () => {
      const task = new Task(
        "task-1",
        "run-1",
        "shell",
        "PENDING",
        [],
        mockInput,
      );
      expect(task.isReady()).toBe(true);
    });

    it("should return false for PENDING with dependencies", () => {
      const task = new Task(
        "task-1",
        "run-1",
        "shell",
        "PENDING",
        ["dep-1"],
        mockInput,
      );
      expect(task.isReady()).toBe(false);
    });
  });

  describe("isTerminal", () => {
    it("should return true for DONE", () => {
      const task = new Task("task-1", "run-1", "shell", "DONE", [], mockInput);
      expect(task.isTerminal()).toBe(true);
    });

    it("should return true for FAILED", () => {
      const task = new Task(
        "task-1",
        "run-1",
        "shell",
        "FAILED",
        [],
        mockInput,
      );
      expect(task.isTerminal()).toBe(true);
    });

    it("should return false for RUNNING", () => {
      const task = new Task(
        "task-1",
        "run-1",
        "shell",
        "RUNNING",
        [],
        mockInput,
      );
      expect(task.isTerminal()).toBe(false);
    });
  });

  describe("toJSON / fromJSON", () => {
    it("should serialize and deserialize correctly", () => {
      const task = new Task("task-1", "run-1", "shell", "DONE", [], mockInput, {
        content: "Output",
      });

      const json = task.toJSON();
      const restored = Task.fromJSON(json);

      expect(restored.id).toBe(task.id);
      expect(restored.runId).toBe(task.runId);
      expect(restored.status).toBe(task.status);
      expect(restored.output?.content).toBe("Output");
    });
  });
});
