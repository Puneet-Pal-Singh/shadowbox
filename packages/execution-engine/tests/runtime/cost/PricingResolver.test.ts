import { describe, it, expect } from "vitest";
import { PricingResolver } from "../../../src/runtime/cost/PricingResolver.js";
import { PricingRegistry } from "../../../src/runtime/cost/PricingRegistry.js";
import type { LLMUsage } from "../../../src/runtime/cost/types.js";

describe("PricingResolver", () => {
  const registry = new PricingRegistry({
    "openai:gpt-4o": {
      inputPrice: 0.005,
      outputPrice: 0.015,
      currency: "USD",
      effectiveDate: "2026-02-13",
    },
  });

  it("prefers provider-reported cost", () => {
    const resolver = new PricingResolver(registry, { unknownPricingMode: "warn" });
    const usage: LLMUsage = {
      provider: "openai",
      model: "gpt-4o",
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      cost: 0.02,
    };

    const resolved = resolver.resolve(usage);
    expect(resolved.pricingSource).toBe("provider");
    expect(resolved.calculatedCostUsd).toBe(0.02);
    expect(resolved.shouldBlock).toBe(false);
  });

  it("uses LiteLLM metadata when present", () => {
    const resolver = new PricingResolver(registry, { unknownPricingMode: "warn" });
    const usage: LLMUsage = {
      provider: "litellm",
      model: "model-x",
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      raw: {
        response_cost: 0.013,
      },
    };

    const resolved = resolver.resolve(usage);
    expect(resolved.pricingSource).toBe("litellm");
    expect(resolved.calculatedCostUsd).toBe(0.013);
  });

  it("falls back to registry pricing", () => {
    const resolver = new PricingResolver(registry, { unknownPricingMode: "warn" });
    const usage: LLMUsage = {
      provider: "openai",
      model: "gpt-4o",
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    };

    const resolved = resolver.resolve(usage);
    expect(resolved.pricingSource).toBe("registry");
    expect(resolved.calculatedCostUsd).toBeCloseTo(0.0125, 6);
  });

  it("flags unknown pricing and blocks in block mode", () => {
    const resolver = new PricingResolver(registry, {
      unknownPricingMode: "block",
    });
    const usage: LLMUsage = {
      provider: "unknown",
      model: "unknown-model",
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    };

    const resolved = resolver.resolve(usage);
    expect(resolved.pricingSource).toBe("unknown");
    expect(resolved.shouldBlock).toBe(true);
  });
});
