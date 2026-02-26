// packages/execution-engine/src/runtime/provider/ProviderConfiguration.test.ts
// Phase 5: Test unified provider configuration

import { describe, it, expect } from "vitest";
import { ProviderConfiguration } from "./ProviderConfiguration.js";

describe("ProviderConfiguration - Phase 5: Unified Provider/Model Routing", () => {
  describe("defaults", () => {
    it("should provide default provider", () => {
      expect(ProviderConfiguration.getDefaultProvider()).toBe("openrouter");
    });

    it("should provide default model", () => {
      expect(ProviderConfiguration.getDefaultModel()).toBe(
        "arcee-ai/trinity-large-preview:free",
      );
    });
  });

  describe("isKnownModel", () => {
    it("should recognize known openrouter models", () => {
      const knownModels = [
        "arcee-ai/trinity-large-preview:free",
        "llama-3.3-70b-versatile",
        "mistral-large",
        "openai/gpt-4o-mini",
        "openai/gpt-4o",
        "anthropic/claude-3.5-sonnet",
      ];

      knownModels.forEach((model) => {
        expect(ProviderConfiguration.isKnownModel("openrouter", model)).toBe(
          true,
          `Should recognize ${model}`,
        );
      });
    });

    it("should reject unknown openrouter models", () => {
      expect(
        ProviderConfiguration.isKnownModel(
          "openrouter",
          "totally-made-up-model",
        ),
      ).toBe(false);
    });

    it("should allow any model for BYOK providers", () => {
      expect(ProviderConfiguration.isKnownModel("litellm", "custom-model")).toBe(
        true,
      );
      expect(ProviderConfiguration.isKnownModel("openai", "custom-model")).toBe(
        true,
      );
    });
  });

  describe("getFallbackModel", () => {
    it("should return valid fallback for openrouter", () => {
      const fallback = ProviderConfiguration.getFallbackModel("openrouter");
      expect(fallback).toBe("llama-3.3-70b-versatile");
    });

    it("should return default for unknown provider", () => {
      const fallback = ProviderConfiguration.getFallbackModel("custom");
      expect(fallback).toBeDefined();
    });
  });

  describe("validateConfig", () => {
    it("should accept valid openrouter config", () => {
      const error = ProviderConfiguration.validateConfig(
        "openrouter",
        "arcee-ai/trinity-large-preview:free",
      );
      expect(error).toBeNull();
    });

    it("should accept any model for BYOK provider", () => {
      const error = ProviderConfiguration.validateConfig(
        "litellm",
        "totally-custom-model",
      );
      expect(error).toBeNull();
    });

    it("should reject unknown openrouter models", () => {
      const error = ProviderConfiguration.validateConfig(
        "openrouter",
        "unknown-model",
      );
      expect(error).not.toBeNull();
      expect(error).toContain("Unknown model");
    });

    it("should reject missing provider or model", () => {
      expect(ProviderConfiguration.validateConfig("", "model")).not.toBeNull();
      expect(ProviderConfiguration.validateConfig("provider", "")).not.toBeNull();
      expect(ProviderConfiguration.validateConfig("", "")).not.toBeNull();
    });
  });

  describe("consistency across layers", () => {
    it("should align with shared-types defaults", () => {
      // Verify that our configuration matches expectations from shared-types
      expect(ProviderConfiguration.getDefaultProvider()).toBe("openrouter");
      expect(ProviderConfiguration.getDefaultModel()).toBe(
        "arcee-ai/trinity-large-preview:free",
      );
    });

    it("should provide models for catalog/capability matrix", () => {
      const knownModels = ProviderConfiguration.KNOWN_OPENROUTER_MODELS;
      expect(knownModels.length).toBeGreaterThan(0);
      expect(knownModels).toContain("arcee-ai/trinity-large-preview:free");
    });
  });
});
