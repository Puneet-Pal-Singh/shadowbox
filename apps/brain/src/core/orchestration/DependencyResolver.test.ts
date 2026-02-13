// apps/brain/src/core/orchestration/DependencyResolver.test.ts

import { describe, it, expect, beforeEach, vi } from "vitest";
import { DependencyResolver } from "./DependencyResolver";
import type { TaskRepository } from "../task";
import { Task } from "../task";

describe("DependencyResolver", () => {
  let resolver: DependencyResolver;
  let mockTaskRepo: ReturnType<typeof createMockTaskRepo>;

  const createMockTaskRepo = () => ({
    getByIds: vi.fn(async (ids: string[]) => []),
  });

  beforeEach(() => {
    mockTaskRepo = createMockTaskRepo();
    resolver = new DependencyResolver(mockTaskRepo as any);
  });

  describe("validateDAG", () => {
    it("should accept valid DAG with no cycles", () => {
      const tasks = [
        new Task("1", "run1", "analyze", "PENDING", [], {}),
        new Task("2", "run1", "edit", "PENDING", ["1"], {}),
        new Task("3", "run1", "test", "PENDING", ["2"], {}),
      ];

      const result = resolver.validateDAG(tasks);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject self-referencing task", () => {
      const tasks = [new Task("1", "run1", "analyze", "PENDING", ["1"], {})];

      const result = resolver.validateDAG(tasks);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("self-reference");
      expect(result.cycle).toEqual(["1"]);
    });

    it("should reject simple cycle (2 tasks)", () => {
      const tasks = [
        new Task("1", "run1", "analyze", "PENDING", ["2"], {}),
        new Task("2", "run1", "edit", "PENDING", ["1"], {}),
      ];

      const result = resolver.validateDAG(tasks);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cycle detected");
    });

    it("should reject complex cycle (3 tasks)", () => {
      const tasks = [
        new Task("1", "run1", "analyze", "PENDING", ["2"], {}),
        new Task("2", "run1", "edit", "PENDING", ["3"], {}),
        new Task("3", "run1", "test", "PENDING", ["1"], {}),
      ];

      const result = resolver.validateDAG(tasks);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cycle detected");
    });

    it("should handle diamond dependency pattern (valid)", () => {
      const tasks = [
        new Task("1", "run1", "analyze", "PENDING", [], {}),
        new Task("2", "run1", "edit", "PENDING", ["1"], {}),
        new Task("3", "run1", "test", "PENDING", ["1"], {}),
        new Task("4", "run1", "review", "PENDING", ["2", "3"], {}),
      ];

      const result = resolver.validateDAG(tasks);
      expect(result.valid).toBe(true);
    });
  });

  describe("topologicalSort", () => {
    it("should sort independent tasks", () => {
      const tasks = [
        new Task("1", "run1", "analyze", "PENDING", [], {}),
        new Task("2", "run1", "edit", "PENDING", [], {}),
        new Task("3", "run1", "test", "PENDING", [], {}),
      ];

      const sorted = resolver.topologicalSort(tasks);
      expect(sorted).toHaveLength(3);
    });

    it("should place dependencies before dependents", () => {
      const tasks = [
        new Task("3", "run1", "test", "PENDING", ["1", "2"], {}),
        new Task("1", "run1", "analyze", "PENDING", [], {}),
        new Task("2", "run1", "edit", "PENDING", ["1"], {}),
      ];

      const sorted = resolver.topologicalSort(tasks);
      const ids = sorted.map((t) => t.id);

      // Task 1 must come before 2 and 3
      expect(ids.indexOf("1")).toBeLessThan(ids.indexOf("2"));
      expect(ids.indexOf("2")).toBeLessThan(ids.indexOf("3"));
    });

    it("should handle linear dependency chain", () => {
      const tasks = [
        new Task("1", "run1", "analyze", "PENDING", [], {}),
        new Task("2", "run1", "edit", "PENDING", ["1"], {}),
        new Task("3", "run1", "test", "PENDING", ["2"], {}),
      ];

      const sorted = resolver.topologicalSort(tasks);
      const ids = sorted.map((t) => t.id);

      expect(ids).toEqual(["1", "2", "3"]);
    });

    it("should handle diamond dependency", () => {
      const tasks = [
        new Task("1", "run1", "analyze", "PENDING", [], {}),
        new Task("2", "run1", "edit", "PENDING", ["1"], {}),
        new Task("3", "run1", "test", "PENDING", ["1"], {}),
        new Task("4", "run1", "review", "PENDING", ["2", "3"], {}),
      ];

      const sorted = resolver.topologicalSort(tasks);
      const ids = sorted.map((t) => t.id);

      // Task 1 first, then 2 and 3 (any order), then 4
      expect(ids[0]).toBe("1");
      expect(ids[3]).toBe("4");
      expect([ids[1], ids[2]]).toEqual(expect.arrayContaining(["2", "3"]));
    });
  });

  describe("areMet", () => {
    it("should return true for empty dependencies", async () => {
      const result = await resolver.areMet([], "run1");
      expect(result).toBe(true);
    });

    it("should return true when all dependencies are DONE", async () => {
      mockTaskRepo.getByIds.mockResolvedValue([
        new Task("1", "run1", "analyze", "DONE", [], {}),
        new Task("2", "run1", "edit", "DONE", [], {}),
      ]);

      const result = await resolver.areMet(["1", "2"], "run1");
      expect(result).toBe(true);
    });

    it("should return false when any dependency is not DONE", async () => {
      mockTaskRepo.getByIds.mockResolvedValue([
        new Task("1", "run1", "analyze", "DONE", [], {}),
        new Task("2", "run1", "edit", "PENDING", [], {}),
      ]);

      const result = await resolver.areMet(["1", "2"], "run1");
      expect(result).toBe(false);
    });

    it("should return false when dependency count mismatch", async () => {
      mockTaskRepo.getByIds.mockResolvedValue([
        new Task("1", "run1", "analyze", "DONE", [], {}),
      ]);

      const result = await resolver.areMet(["1", "2"], "run1");
      expect(result).toBe(false);
    });
  });
});
