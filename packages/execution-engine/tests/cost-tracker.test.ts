/**
 * CostTracker Tests
 * Tests cost accumulation and tracking
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { CostTracker } from "../src/cost/CostTracker.js";

describe("CostTracker", () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker("run-123");
  });

  describe("constructor", () => {
    it("should create tracker with valid runId", () => {
      expect(tracker).toBeDefined();
    });

    it("should reject empty runId", () => {
      expect(() => new CostTracker("")).toThrow();
    });

    it("should reject short runId", () => {
      expect(() => new CostTracker("abc")).toThrow();
    });
  });

  describe("addModelTokensCost", () => {
    it("should add token cost correctly", () => {
      tracker.addModelTokensCost(1000, 0.00001); // 1000 tokens at $0.00001 each
      const summary = tracker.getSummary();

      expect(summary.totalCosts.modelTokens).toBe(0.01);
    });

    it("should accumulate multiple token costs", () => {
      tracker.addModelTokensCost(1000, 0.00001);
      tracker.addModelTokensCost(500, 0.00001);
      const summary = tracker.getSummary();

      expect(summary.totalCosts.modelTokens).toBe(0.015);
    });
  });

  describe("addComputeTimeCost", () => {
    it("should add compute cost correctly", () => {
      tracker.addComputeTimeCost(5000, 0.000001); // 5000ms at $0.000001/ms
      const summary = tracker.getSummary();

      expect(summary.totalCosts.computeTime).toBe(0.005);
    });

    it("should accumulate multiple compute costs", () => {
      tracker.addComputeTimeCost(1000, 0.000001);
      tracker.addComputeTimeCost(2000, 0.000001);
      const summary = tracker.getSummary();

      expect(summary.totalCosts.computeTime).toBe(0.003);
    });
  });

  describe("getSummary", () => {
    it("should return cost summary", () => {
      tracker.addModelTokensCost(1000, 0.00001);
      tracker.addComputeTimeCost(5000, 0.000001);
      const summary = tracker.getSummary();

      expect(summary.runId).toBe("run-123");
      expect(summary.totalCost).toBe(0.015); // 0.01 + 0.005
      expect(summary.startTime).toBeLessThanOrEqual(Date.now());
      expect(summary.endTime).toBeUndefined();
    });

    it("should include cost breakdown", () => {
      tracker.addModelTokensCost(1000, 0.00001);
      const summary = tracker.getSummary();

      expect(summary.costBreakdown).toHaveLength(1);
      expect(summary.costBreakdown[0].type).toBe("model_tokens");
    });

    it("should calculate duration", () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      tracker = new CostTracker("run-123"); // Create tracker after enabling fake timers
      vi.setSystemTime(startTime + 1000);

      const summary = tracker.getSummary();
      expect(summary.duration).toBe(1000);

      vi.useRealTimers();
    });
  });

  describe("finalize", () => {
    it("should return summary with endTime", () => {
      const summary = tracker.finalize();

      expect(summary.endTime).toBeDefined();
      expect(summary.endTime).toBeGreaterThanOrEqual(summary.startTime);
    });

    it("should include all costs", () => {
      tracker.addModelTokensCost(1000, 0.00001);
      tracker.addComputeTimeCost(5000, 0.000001);
      const summary = tracker.finalize();

      expect(summary.totalCost).toBeGreaterThan(0);
      expect(summary.totalCosts.modelTokens).toBeGreaterThan(0);
      expect(summary.totalCosts.computeTime).toBeGreaterThan(0);
    });
  });

  describe("cost breakdown", () => {
    it("should track multiple cost types", () => {
      tracker.addModelTokensCost(1000, 0.00001);
      tracker.addComputeTimeCost(5000, 0.000001);
      tracker.addCost({ type: "storage", amount: 0.001, currency: "USD" });
      const summary = tracker.getSummary();

      expect(summary.costBreakdown).toHaveLength(3);
      expect(summary.totalCosts.storage).toBe(0.001);
    });

    it("should calculate by type correctly", () => {
      tracker.addModelTokensCost(1000, 0.00001);
      tracker.addModelTokensCost(1000, 0.00001);
      const summary = tracker.getSummary();

      expect(summary.totalCosts.modelTokens).toBe(0.02);
    });
  });
});
