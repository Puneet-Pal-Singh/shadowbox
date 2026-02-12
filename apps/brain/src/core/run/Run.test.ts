// apps/brain/src/core/run/Run.test.ts
// Phase 3A: Unit tests for Run entity

import { describe, it, expect } from "vitest";
import { Run, InvalidStateTransitionError } from "./Run";
import type { RunInput } from "../../types";

describe("Run", () => {
  const mockInput: RunInput = {
    agentType: "coding",
    prompt: "Test prompt",
    sessionId: "test-session",
  };

  describe("constructor", () => {
    it("should create a run with default values", () => {
      const run = new Run("run-1", "session-1", "CREATED", "coding", mockInput);

      expect(run.id).toBe("run-1");
      expect(run.sessionId).toBe("session-1");
      expect(run.status).toBe("CREATED");
      expect(run.agentType).toBe("coding");
      expect(run.metadata.prompt).toBe("Test prompt");
    });

    it("should set createdAt and updatedAt", () => {
      const before = new Date();
      const run = new Run("run-1", "session-1", "CREATED", "coding", mockInput);
      const after = new Date();

      expect(run.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(run.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("transition", () => {
    it("should transition from CREATED to PLANNING", () => {
      const run = new Run("run-1", "session-1", "CREATED", "coding", mockInput);
      run.transition("PLANNING");
      expect(run.status).toBe("PLANNING");
    });

    it("should transition through valid states", () => {
      const run = new Run("run-1", "session-1", "CREATED", "coding", mockInput);

      run.transition("PLANNING");
      expect(run.status).toBe("PLANNING");

      run.transition("RUNNING");
      expect(run.status).toBe("RUNNING");

      run.transition("COMPLETED");
      expect(run.status).toBe("COMPLETED");
    });

    it("should throw on invalid transition", () => {
      const run = new Run("run-1", "session-1", "CREATED", "coding", mockInput);

      expect(() => run.transition("COMPLETED")).toThrow(
        InvalidStateTransitionError,
      );
    });

    it("should set startedAt when transitioning to RUNNING", () => {
      const run = new Run(
        "run-1",
        "session-1",
        "PLANNING",
        "coding",
        mockInput,
      );
      run.transition("RUNNING");

      expect(run.metadata.startedAt).toBeDefined();
    });

    it("should set completedAt when transitioning to terminal state", () => {
      const run = new Run("run-1", "session-1", "RUNNING", "coding", mockInput);
      run.transition("COMPLETED");

      expect(run.metadata.completedAt).toBeDefined();
    });

    it("should update updatedAt timestamp", async () => {
      const run = new Run("run-1", "session-1", "CREATED", "coding", mockInput);
      const beforeUpdate = run.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));
      run.transition("PLANNING");

      expect(run.updatedAt.getTime()).toBeGreaterThan(beforeUpdate.getTime());
    });
  });

  describe("toJSON / fromJSON", () => {
    it("should serialize and deserialize correctly", () => {
      const run = new Run(
        "run-1",
        "session-1",
        "RUNNING",
        "coding",
        mockInput,
        {
          content: "Test output",
        },
      );

      const json = run.toJSON();
      const restored = Run.fromJSON(json);

      expect(restored.id).toBe(run.id);
      expect(restored.sessionId).toBe(run.sessionId);
      expect(restored.status).toBe(run.status);
      expect(restored.agentType).toBe(run.agentType);
      expect(restored.output?.content).toBe("Test output");
    });
  });
});
