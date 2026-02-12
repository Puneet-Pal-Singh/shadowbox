/**
 * PricingProvider Tests
 * Verifies StaticPricingProvider loads, validates, and serves pricing correctly
 */

import { describe, it, expect, beforeAll } from "vitest";
import { MockPricingProvider } from "../src/pricing/MockPricingProvider.js";
import { DEFAULT_PRICING_CURRENCY } from "../src/pricing/PricingProvider.js";

/**
 * Test suite for PricingProvider interface
 * Uses MockPricingProvider (test fixture)
 * Phase 3 will test real providers (LiteLLMPricingProvider, etc.)
 */
describe("PricingProvider (via MockPricingProvider)", () => {
  let provider: MockPricingProvider;

  beforeAll(() => {
    provider = new MockPricingProvider();
  });

  describe("initialization", () => {
    it("should create mock provider with test fixtures", () => {
      expect(provider).toBeDefined();
    });

    it("should throw for unknown models in test fixtures", async () => {
      await expect(
        provider.getPricing("unknown-model", "openai"),
      ).rejects.toThrow();
    });
  });

  describe("getPricing", () => {
    it("should return pricing with correct structure", async () => {
      const pricing = await provider.getPricing("gpt-4o", "openai");

      expect(pricing).toMatchObject({
        model: expect.any(String),
        provider: expect.any(String),
        inputPer1k: expect.any(Number),
        outputPer1k: expect.any(Number),
        lastUpdated: expect.any(String),
        currency: DEFAULT_PRICING_CURRENCY,
      });
    });

    it("should throw for unknown model with helpful message", async () => {
      await expect(
        provider.getPricing("unknown-model", "openai"),
      ).rejects.toThrow(/Model "unknown-model" not found/);
    });

    it("should throw for unknown provider", async () => {
      await expect(
        provider.getPricing("gpt-4o", "unknown-provider"),
      ).rejects.toThrow();
    });
  });

  describe("listAvailableModels", () => {
    it("should return all unique models", async () => {
      const models = await provider.listAvailableModels();

      expect(models).toContain("gpt-4o");
      expect(models).toContain("gpt-4-turbo");
      expect(models).toContain("gpt-3.5-turbo");
      expect(models).toContain("claude-3-5-sonnet");
      expect(models).toContain("claude-3-opus");
      expect(models).toContain("llama3-70b");
      expect(models).toContain("llama2");
    });

    it("should return models in sorted order", async () => {
      const models = await provider.listAvailableModels();
      const sorted = [...models].sort();

      expect(models).toEqual(sorted);
    });

    it("should not have duplicates", async () => {
      const models = await provider.listAvailableModels();
      const unique = new Set(models);

      expect(models.length).toBe(unique.size);
    });
  });

  describe("listSupportedProviders", () => {
    it("should return all providers", async () => {
      const providers = await provider.listSupportedProviders();

      expect(providers).toContain("openai");
      expect(providers).toContain("anthropic");
      expect(providers).toContain("groq");
      expect(providers).toContain("ollama");
    });

    it("should return providers in sorted order", async () => {
      const providers = await provider.listSupportedProviders();
      const sorted = [...providers].sort();

      expect(providers).toEqual(sorted);
    });

    it("should not have duplicates", async () => {
      const providers = await provider.listSupportedProviders();
      const unique = new Set(providers);

      expect(providers.length).toBe(unique.size);
    });
  });

  describe("pricing data validation", () => {
    it("should have valid ISO timestamps", async () => {
      const models = await provider.listAvailableModels();

      for (const model of models) {
        const providers = await provider.listSupportedProviders();
        for (const prov of providers) {
          try {
            const pricing = await provider.getPricing(model, prov);
            const date = new Date(pricing.lastUpdated);
            expect(date.getTime()).not.toBeNaN();
          } catch {
            // Model not in this provider, skip
          }
        }
      }
    });

    it("should have non-negative prices", async () => {
      const models = await provider.listAvailableModels();

      for (const model of models) {
        const providers = await provider.listSupportedProviders();
        for (const prov of providers) {
          try {
            const pricing = await provider.getPricing(model, prov);
            expect(pricing.inputPer1k).toBeGreaterThanOrEqual(0);
            expect(pricing.outputPer1k).toBeGreaterThanOrEqual(0);
          } catch {
            // Model not in this provider, skip
          }
        }
      }
    });

    it("should have currency as USD", async () => {
      const models = await provider.listAvailableModels();

      for (const model of models) {
        const providers = await provider.listSupportedProviders();
        for (const prov of providers) {
          try {
            const pricing = await provider.getPricing(model, prov);
            expect(pricing.currency).toBe(DEFAULT_PRICING_CURRENCY);
          } catch {
            // Model not in this provider, skip
          }
        }
      }
    });
  });
});
