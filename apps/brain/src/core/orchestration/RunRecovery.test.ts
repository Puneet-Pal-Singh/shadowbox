// apps/brain/src/core/orchestration/RunRecovery.test.ts

import { describe, it, expect, beforeEach, vi } from "vitest";
import { RunRecovery } from "./RunRecovery";
import { Run, RunRepository } from "../run";
import { Task, TaskRepository } from "../task";

describe("RunRecovery", () => {
  let recovery: RunRecovery;
  let mockRunRepo: any;
  let mockTaskRepo: any;

  beforeEach(() => {
    mockRunRepo = {
      getById: vi.fn(),
      update: vi.fn(),
    };
    mockTaskRepo = {
      getByRun: vi.fn(),
    };
    recovery = new RunRecovery(mockRunRepo, mockTaskRepo);
  });

  describe("resumeRun", () => {
    it("should resume a run in RUNNING state", async () => {
      const run = new Run("run1", "session1", "RUNNING", "coding", {
        prompt: "test",
      });
      mockRunRepo.getById.mockResolvedValue(run);
      mockTaskRepo.getByRun.mockResolvedValue([]);

      const resumed = await recovery.resumeRun("run1");

      expect(resumed.id).toBe("run1");
      expect(resumed.status).toBe("RUNNING");
    });

    it("should throw error for non-existent run", async () => {
      mockRunRepo.getById.mockResolvedValue(null);

      await expect(recovery.resumeRun("nonexistent")).rejects.toThrow(
        "not found",
      );
    });

    it("should throw error for COMPLETED run", async () => {
      const run = new Run("run1", "session1", "COMPLETED", "coding", {
        prompt: "test",
      });
      mockRunRepo.getById.mockResolvedValue(run);
      mockTaskRepo.getByRun.mockResolvedValue([]);

      await expect(recovery.resumeRun("run1")).rejects.toThrow("Cannot resume");
    });

    it("should throw error for FAILED run", async () => {
      const run = new Run("run1", "session1", "FAILED", "coding", {
        prompt: "test",
      });
      mockRunRepo.getById.mockResolvedValue(run);
      mockTaskRepo.getByRun.mockResolvedValue([]);

      await expect(recovery.resumeRun("run1")).rejects.toThrow("Cannot resume");
    });

    it("should throw error for CANCELLED run", async () => {
      const run = new Run("run1", "session1", "CANCELLED", "coding", {
        prompt: "test",
      });
      mockRunRepo.getById.mockResolvedValue(run);
      mockTaskRepo.getByRun.mockResolvedValue([]);

      await expect(recovery.resumeRun("run1")).rejects.toThrow("Cannot resume");
    });
  });

  describe("reconstructState", () => {
    it("should set COMPLETED when all tasks DONE", async () => {
      const run = new Run("run1", "session1", "RUNNING", "coding", {
        prompt: "test",
      });
      const tasks = [
        new Task("1", "run1", "analyze", "DONE", []),
        new Task("2", "run1", "edit", "DONE", []),
      ];
      mockTaskRepo.getByRun.mockResolvedValue(tasks);

      await recovery.reconstructState(run);

      expect(run.status).toBe("COMPLETED");
      expect(mockRunRepo.update).toHaveBeenCalledWith(run);
    });

    it("should set FAILED when any task FAILED", async () => {
      const run = new Run("run1", "session1", "RUNNING", "coding", {
        prompt: "test",
      });
      const tasks = [
        new Task("1", "run1", "analyze", "DONE", []),
        new Task("2", "run1", "edit", "FAILED", []),
      ];
      mockTaskRepo.getByRun.mockResolvedValue(tasks);

      await recovery.reconstructState(run);

      expect(run.status).toBe("FAILED");
      expect(run.metadata.error).toContain("1 task(s) failed");
      expect(mockRunRepo.update).toHaveBeenCalledWith(run);
    });

    it("should set CANCELLED when any task CANCELLED", async () => {
      const run = new Run("run1", "session1", "RUNNING", "coding", {
        prompt: "test",
      });
      const tasks = [
        new Task("1", "run1", "analyze", "CANCELLED", []),
      ];
      mockTaskRepo.getByRun.mockResolvedValue(tasks);

      await recovery.reconstructState(run);

      expect(run.status).toBe("CANCELLED");
      expect(mockRunRepo.update).toHaveBeenCalledWith(run);
    });

    it("should keep RUNNING when tasks pending", async () => {
      const run = new Run("run1", "session1", "RUNNING", "coding", {
        prompt: "test",
      });
      const tasks = [
        new Task("1", "run1", "analyze", "DONE", []),
        new Task("2", "run1", "edit", "PENDING", []),
      ];
      mockTaskRepo.getByRun.mockResolvedValue(tasks);

      await recovery.reconstructState(run);

      expect(run.status).toBe("RUNNING");
    });

    it("should handle no tasks", async () => {
      const run = new Run("run1", "session1", "PLANNING", "coding", {
        prompt: "test",
      });
      mockTaskRepo.getByRun.mockResolvedValue([]);

      await recovery.reconstructState(run);

      // Status unchanged
      expect(run.status).toBe("PLANNING");
      expect(mockRunRepo.update).not.toHaveBeenCalled();
    });
  });

  describe("findLastIncompleteTask", () => {
    it("should find last incomplete task", async () => {
      const tasks = [
        new Task("1", "run1", "analyze", "DONE", []),
        new Task("2", "run1", "edit", "PENDING", []),
        new Task("3", "run1", "test", "DONE", []),
      ];
      mockTaskRepo.getByRun.mockResolvedValue(tasks);

      const incomplete = await recovery.findLastIncompleteTask("run1");

      expect(incomplete?.id).toBe("2");
    });

    it("should return null when all tasks complete", async () => {
      const tasks = [
        new Task("1", "run1", "analyze", "DONE", []),
        new Task("2", "run1", "edit", "DONE", []),
      ];
      mockTaskRepo.getByRun.mockResolvedValue(tasks);

      const incomplete = await recovery.findLastIncompleteTask("run1");

      expect(incomplete).toBeNull();
    });

    it("should return null when all tasks failed", async () => {
      const tasks = [
        new Task("1", "run1", "analyze", "FAILED", []),
      ];
      mockTaskRepo.getByRun.mockResolvedValue(tasks);

      const incomplete = await recovery.findLastIncompleteTask("run1");

      expect(incomplete).toBeNull();
    });

    it("should return running task", async () => {
      const tasks = [
        new Task("1", "run1", "analyze", "DONE", []),
        new Task("2", "run1", "edit", "RUNNING", []),
      ];
      mockTaskRepo.getByRun.mockResolvedValue(tasks);

      const incomplete = await recovery.findLastIncompleteTask("run1");

      expect(incomplete?.id).toBe("2");
    });

    it("should return empty array when no tasks", async () => {
      mockTaskRepo.getByRun.mockResolvedValue([]);

      const incomplete = await recovery.findLastIncompleteTask("run1");

      expect(incomplete).toBeNull();
    });
  });
});
