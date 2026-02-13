// apps/brain/src/core/cost/PricingRegistry.test.ts
// Phase 3.1: Unit tests for PricingRegistry three-tier pricing strategy

import { describe, it, expect, beforeEach } from "vitest";
import { PricingRegistry, PricingError } from "./PricingRegistry";
import type { LLMUsage } from "./types";

describe("PricingRegistry", () => {
  let registry: PricingRegistry;

  beforeEach(() => {
    registry = new PricingRegistry();
  });

  describe("getPrice", () => {
    it("should return price for known model", () => {
      const price = registry.getPrice("openai", "gpt-4o");
      expect(price).not.toBeNull();
      expect(price?.inputPrice).toBe(0.005);
      expect(price?.outputPrice).toBe(0.015);
    });

    it("should return null for unknown model", () => {
      const price = registry.getPrice("unknown", "unknown-model");
      expect(price).toBeNull();
    });

    it("should return price for Anthropic models", () => {
      const price = registry.getPrice("anthropic", "claude-3-opus");
      expect(price).not.toBeNull();
      expect(price?.inputPrice).toBe(0.015);
      expect(price?.outputPrice).toBe(0.075);
    });
  });

  describe("calculateCost", () => {
    it("should use Tier 1: provider cost if available", () => {
      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        cost: 0.02, // Provider returns pre-calculated cost
      };

      const cost = registry.calculateCost(usage);

      expect(cost.totalCost).toBe(0.02);
      expect(cost.pricingSource).toBe("provider");
    });

    it("should use Tier 2: registry pricing for known models", () => {
      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      };

      const cost = registry.calculateCost(usage);

      // GPT-4o: $0.005/1K prompt, $0.015/1K completion
      // 1000 prompt = $0.005, 500 completion = $0.0075
      expect(cost.totalCost).toBeCloseTo(0.0125, 4);
      expect(cost.inputCost).toBeCloseTo(0.005, 4);
      expect(cost.outputCost).toBeCloseTo(0.0075, 4);
      expect(cost.pricingSource).toBe("registry");
    });

    it("should return zero cost for unknown models", () => {
      const usage: LLMUsage = {
        provider: "unknown",
        model: "unknown-model",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      };

      const cost = registry.calculateCost(usage);

      expect(cost.totalCost).toBe(0);
      expect(cost.pricingSource).toBe("registry");
    });

    it("should calculate cost for GPT-4o-mini correctly", () => {
      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o-mini",
        promptTokens: 2000,
        completionTokens: 1000,
        totalTokens: 3000,
      };

      const cost = registry.calculateCost(usage);

      // GPT-4o-mini: $0.00015/1K prompt, $0.0006/1K completion
      // 2000 prompt = $0.0003, 1000 completion = $0.0006
      expect(cost.totalCost).toBeCloseTo(0.0009, 6);
    });

    it("should calculate cost for Claude 3 Opus correctly", () => {
      const usage: LLMUsage = {
        provider: "anthropic",
        model: "claude-3-opus",
        promptTokens: 10000,
        completionTokens: 5000,
        totalTokens: 15000,
      };

      const cost = registry.calculateCost(usage);

      // Claude-3-opus: $0.015/1K prompt, $0.075/1K completion
      // 10000 prompt = $0.15, 5000 completion = $0.375
      expect(cost.totalCost).toBeCloseTo(0.525, 3);
    });
  });

  describe("registerPrice", () => {
    it("should register custom pricing", () => {
      registry.registerPrice("custom", "custom-model", {
        inputPrice: 0.01,
        outputPrice: 0.02,
        currency: "USD",
        effectiveDate: "2024-06-01",
      });

      const price = registry.getPrice("custom", "custom-model");
      expect(price?.inputPrice).toBe(0.01);
      expect(price?.outputPrice).toBe(0.02);
    });

    it("should override existing pricing", () => {
      // Override GPT-4o pricing
      registry.registerPrice("openai", "gpt-4o", {
        inputPrice: 0.1,
        outputPrice: 0.2,
        currency: "USD",
        effectiveDate: "2024-06-01",
      });

      const price = registry.getPrice("openai", "gpt-4o");
      expect(price?.inputPrice).toBe(0.1);
    });
  });

  describe("loadFromJSON", () => {
    it("should load pricing from JSON object", () => {
      const pricingData = {
        "openai:gpt-4-turbo": {
          inputPrice: 0.01,
          outputPrice: 0.03,
          currency: "USD",
          effectiveDate: "2024-01-01",
        },
        "anthropic:claude-3-haiku": {
          inputPrice: 0.00025,
          outputPrice: 0.00125,
          currency: "USD",
          effectiveDate: "2024-01-01",
        },
      };

      registry.loadFromJSON(pricingData);

      const gpt4Turbo = registry.getPrice("openai", "gpt-4-turbo");
      expect(gpt4Turbo?.inputPrice).toBe(0.01);

      const claudeHaiku = registry.getPrice("anthropic", "claude-3-haiku");
      expect(claudeHaiku?.outputPrice).toBe(0.00125);
    });
  });
});
