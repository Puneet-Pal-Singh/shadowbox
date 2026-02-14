// apps/brain/src/core/cost/CostTracker.test.ts
// Phase 3.1: Unit tests for CostTracker with PricingRegistry

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CostTracker } from "../../../src/runtime/cost/CostTracker.js";
import { PricingRegistry } from "../../../src/runtime/cost/PricingRegistry.js";
import type { LLMUsage, RuntimeDurableObjectState } from "../../../src/runtime/cost/types.js";

describe("CostTracker", () => {
  let mockStorage: Map<string, unknown>;
  let mockCtx: Partial<RuntimeDurableObjectState>;
  let pricingRegistry: PricingRegistry;
  let costTracker: CostTracker;

  // Sample pricing for tests
  const testPricing = {
    "openai:gpt-4o": {
      inputPrice: 0.005,
      outputPrice: 0.015,
      currency: "USD",
      effectiveDate: "2024-01-01",
    },
    "openai:gpt-4o-mini": {
      inputPrice: 0.00015,
      outputPrice: 0.0006,
      currency: "USD",
      effectiveDate: "2024-01-01",
    },
    "anthropic:claude-3-sonnet": {
      inputPrice: 0.003,
      outputPrice: 0.015,
      currency: "USD",
      effectiveDate: "2024-01-01",
    },
  };

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
      } as RuntimeDurableObjectState["storage"],
      blockConcurrencyWhile: vi.fn((callback: () => Promise<unknown>) =>
        callback(),
      ),
    };

    pricingRegistry = new PricingRegistry(testPricing);
    costTracker = new CostTracker(
      mockCtx as RuntimeDurableObjectState,
      pricingRegistry,
    );
  });

  describe("recordLLMUsage", () => {
    it("should record LLM usage as append-only CostEvent", async () => {
      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      };

      await costTracker.recordLLMUsage("run-1", usage);

      const events = await costTracker.getCostEvents("run-1");
      expect(events).toHaveLength(1);
      expect(events[0].runId).toBe("run-1");
      expect(events[0].provider).toBe("openai");
      expect(events[0].model).toBe("gpt-4o");
      expect(events[0].promptTokens).toBe(1000);
      expect(events[0].completionTokens).toBe(500);
      expect(events[0].calculatedCostUsd).toBeGreaterThan(0);
    });

    it("should accumulate multiple usages as separate events", async () => {
      const usage1: LLMUsage = {
        provider: "openai",
        model: "gpt-4o-mini",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      };

      const usage2: LLMUsage = {
        provider: "anthropic",
        model: "claude-3-sonnet",
        promptTokens: 500,
        completionTokens: 250,
        totalTokens: 750,
      };

      await costTracker.recordLLMUsage("run-1", usage1);
      await costTracker.recordLLMUsage("run-1", usage2);

      const events = await costTracker.getCostEvents("run-1");
      expect(events).toHaveLength(2);
    });

    it("should handle unknown models gracefully", async () => {
      const usage: LLMUsage = {
        provider: "unknown",
        model: "unknown-model",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      };

      await costTracker.recordLLMUsage("run-1", usage);

      const events = await costTracker.getCostEvents("run-1");
      expect(events).toHaveLength(1);
      expect(events[0].calculatedCostUsd).toBe(0);
    });
  });

  describe("aggregateRunCost", () => {
    it("should return empty snapshot for unknown run", async () => {
      const snapshot = await costTracker.aggregateRunCost("unknown-run");
      expect(snapshot.runId).toBe("unknown-run");
      expect(snapshot.totalCost).toBe(0);
      expect(snapshot.totalTokens).toBe(0);
      expect(snapshot.eventCount).toBe(0);
    });

    it("should aggregate costs by model", async () => {
      const usage1: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      };

      const usage2: LLMUsage = {
        provider: "openai",
        model: "gpt-4o-mini",
        promptTokens: 500,
        completionTokens: 250,
        totalTokens: 750,
      };

      await costTracker.recordLLMUsage("run-1", usage1);
      await costTracker.recordLLMUsage("run-1", usage2);

      const snapshot = await costTracker.aggregateRunCost("run-1");

      expect(snapshot.eventCount).toBe(2);
      expect(snapshot.totalTokens).toBe(2250);
      expect(snapshot.byModel["openai:gpt-4o"]).toBeDefined();
      expect(snapshot.byModel["openai:gpt-4o-mini"]).toBeDefined();
    });

    it("should aggregate costs by provider", async () => {
      const usage1: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      };

      const usage2: LLMUsage = {
        provider: "anthropic",
        model: "claude-3-sonnet",
        promptTokens: 500,
        completionTokens: 250,
        totalTokens: 750,
      };

      await costTracker.recordLLMUsage("run-1", usage1);
      await costTracker.recordLLMUsage("run-1", usage2);

      const snapshot = await costTracker.aggregateRunCost("run-1");

      expect(snapshot.byProvider["openai"]).toBeDefined();
      expect(snapshot.byProvider["anthropic"]).toBeDefined();
    });
  });

  describe("getCurrentCost", () => {
    it("should return 0 for run with no events", async () => {
      const cost = await costTracker.getCurrentCost("unknown-run");
      expect(cost).toBe(0);
    });

    it("should return accumulated cost for run", async () => {
      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      };

      await costTracker.recordLLMUsage("run-1", usage);
      await costTracker.recordLLMUsage("run-1", usage);

      const cost = await costTracker.getCurrentCost("run-1");
      expect(cost).toBeGreaterThan(0);
    });
  });

  describe("PricingRegistry integration", () => {
    it("should use registry pricing for known models", async () => {
      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      };

      await costTracker.recordLLMUsage("run-1", usage);

      const events = await costTracker.getCostEvents("run-1");
      expect(events[0].pricingSource).toBe("registry");
      // GPT-4o: $0.005/1K prompt, $0.015/1K completion
      // 1000 prompt = $0.005, 500 completion = $0.0075
      expect(events[0].calculatedCostUsd).toBeCloseTo(0.0125, 4);
    });

    it("should use provider cost if available in usage", async () => {
      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        cost: 0.015, // Provider returns pre-calculated cost
      };

      await costTracker.recordLLMUsage("run-1", usage);

      const events = await costTracker.getCostEvents("run-1");
      expect(events[0].pricingSource).toBe("provider");
      expect(events[0].calculatedCostUsd).toBe(0.015);
    });
  });
});
