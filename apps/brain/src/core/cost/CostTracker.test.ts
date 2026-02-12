// apps/brain/src/core/cost/CostTracker.test.ts
// Phase 3A: Unit tests for CostTracker

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CostTracker } from "./CostTracker";
import type { DurableObjectState } from "@cloudflare/workers-types";
import type { TokenUsage, CostSnapshot } from "../../types";

describe("CostTracker", () => {
  let mockStorage: Map<string, unknown>;
  let mockCtx: Partial<DurableObjectState>;
  let costTracker: CostTracker;

  beforeEach(() => {
    mockStorage = new Map();
    mockCtx = {
      storage: {
        get: vi.fn(<T>(key: string) =>
          Promise.resolve(mockStorage.get(key) as T | undefined),
        ),
        put: vi.fn((key: string, value: unknown) => {
          mockStorage.set(key, value);
          return Promise.resolve();
        }),
        delete: vi.fn((key: string) => {
          mockStorage.delete(key);
          return Promise.resolve(true);
        }),
        list: vi.fn(() => Promise.resolve(new Map())),
      } as unknown as DurableObjectState["storage"],
      blockConcurrencyWhile: vi.fn(<T>(callback: () => Promise<T>) =>
        callback(),
      ),
    };

    costTracker = new CostTracker(mockCtx as DurableObjectState);
  });

  describe("estimateCost", () => {
    it("should estimate cost for known model", () => {
      const cost = costTracker.estimateCost("gpt-4", 1000, 500);
      // GPT-4: $0.03/1K prompt, $0.06/1K completion
      // 1000 prompt tokens = $0.03, 500 completion tokens = $0.03
      expect(cost).toBeCloseTo(0.06, 5);
    });

    it("should use default rates for unknown model", () => {
      const cost = costTracker.estimateCost("unknown-model", 1000, 1000);
      expect(cost).toBeGreaterThan(0);
    });

    it("should handle zero tokens", () => {
      const cost = costTracker.estimateCost("gpt-3.5-turbo", 0, 0);
      expect(cost).toBe(0);
    });
  });

  describe("recordUsage", () => {
    it("should record token usage", async () => {
      const usage: TokenUsage = {
        model: "gpt-3.5-turbo",
        promptTokens: 1000,
        completionTokens: 500,
      };

      await costTracker.recordUsage("run-1", usage);

      const snapshot = await costTracker.getCostSnapshot("run-1");
      expect(snapshot.totalTokens).toBe(1500);
      expect(snapshot.totalCost).toBeGreaterThan(0);
    });

    it("should accumulate multiple usages", async () => {
      const usage1: TokenUsage = {
        model: "gpt-3.5-turbo",
        promptTokens: 1000,
        completionTokens: 500,
      };

      const usage2: TokenUsage = {
        model: "gpt-3.5-turbo",
        promptTokens: 500,
        completionTokens: 250,
      };

      await costTracker.recordUsage("run-1", usage1);
      await costTracker.recordUsage("run-1", usage2);

      const snapshot = await costTracker.getCostSnapshot("run-1");
      expect(snapshot.totalTokens).toBe(2250);
    });

    it("should track costs by model", async () => {
      const usage: TokenUsage = {
        model: "gpt-4",
        promptTokens: 1000,
        completionTokens: 500,
      };

      await costTracker.recordUsage("run-1", usage);

      const snapshot = await costTracker.getCostSnapshot("run-1");
      expect(snapshot.byModel["gpt-4"]).toBeDefined();
      expect(snapshot.byModel["gpt-4"].promptTokens).toBe(1000);
      expect(snapshot.byModel["gpt-4"].completionTokens).toBe(500);
    });
  });

  describe("getCostSnapshot", () => {
    it("should return empty snapshot for unknown run", async () => {
      const snapshot = await costTracker.getCostSnapshot("unknown-run");
      expect(snapshot.runId).toBe("unknown-run");
      expect(snapshot.totalCost).toBe(0);
      expect(snapshot.totalTokens).toBe(0);
    });

    it("should return recorded snapshot", async () => {
      const usage: TokenUsage = {
        model: "gpt-3.5-turbo",
        promptTokens: 1000,
        completionTokens: 500,
      };

      await costTracker.recordUsage("run-1", usage);
      const snapshot = await costTracker.getCostSnapshot("run-1");

      expect(snapshot.runId).toBe("run-1");
      expect(snapshot.totalTokens).toBe(1500);
    });
  });

  describe("getTotalCostForSession", () => {
    it("should return 0 for unknown session", async () => {
      const cost = await costTracker.getTotalCostForSession("unknown-session");
      expect(cost).toBe(0);
    });

    it("should return cached session cost", async () => {
      mockStorage.set("session_cost:session-1", 1.5);
      const cost = await costTracker.getTotalCostForSession("session-1");
      expect(cost).toBe(1.5);
    });
  });
});
