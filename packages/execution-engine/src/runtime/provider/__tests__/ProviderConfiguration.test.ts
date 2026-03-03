import { describe, it, expect } from "vitest";
import { ProviderConfiguration } from "../ProviderConfiguration.js";

/**
 * Tests for RCP3: Fallback model removal from ProviderConfiguration.
 * 
 * Verifies that silent fallback model selection is completely removed
 * and explicit DEFAULT_MODEL is used instead.
 */
describe("ProviderConfiguration - RCP3: No Fallback Models", () => {
  describe("Default Configuration", () => {
    it("should define DEFAULT_PROVIDER", () => {
      expect(ProviderConfiguration.DEFAULT_PROVIDER).toBe("openrouter");
    });

    it("should define DEFAULT_MODEL", () => {
      expect(ProviderConfiguration.DEFAULT_MODEL).toBe(
        "arcee-ai/trinity-large-preview:free",
      );
    });

    it("should have KNOWN_OPENROUTER_MODELS without fallback chain", () => {
      const models = ProviderConfiguration.KNOWN_OPENROUTER_MODELS;

      expect(models).toContain("arcee-ai/trinity-large-preview:free");
      expect(models.length).toBeGreaterThan(0);

      // Should not have a separate FALLBACK_MODELS constant
      expect((ProviderConfiguration as any).FALLBACK_MODELS).toBeUndefined();
    });
  });

  describe("getFallbackModel Deprecation (RCP3)", () => {
    it("should throw error when getFallbackModel is called", () => {
      expect(() => {
        ProviderConfiguration.getFallbackModel("openrouter");
      }).toThrow();
    });

    it("should mention RCP3 in the error message", () => {
      try {
        ProviderConfiguration.getFallbackModel("openrouter");
        expect.fail("Should have thrown");
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain("RCP3");
        expect(message).toContain("deprecated");
        expect(message).toContain("fallback");
      }
    });

    it("should suggest using DEFAULT_MODEL instead", () => {
      try {
        ProviderConfiguration.getFallbackModel("openrouter");
        expect.fail("Should have thrown");
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain("DEFAULT_MODEL");
      }
    });

    it("should error for any provider, not just openrouter", () => {
      const providers = ["openrouter", "custom-provider", "unknown"];

      for (const provider of providers) {
        expect(() => {
          ProviderConfiguration.getFallbackModel(provider);
        }).toThrow();
      }
    });
  });

  describe("getDefaultProvider", () => {
    it("should return openrouter", () => {
      expect(ProviderConfiguration.getDefaultProvider()).toBe("openrouter");
    });
  });

  describe("getDefaultModel", () => {
    it("should return the default model", () => {
      expect(ProviderConfiguration.getDefaultModel()).toBe(
        "arcee-ai/trinity-large-preview:free",
      );
    });

    it("should not change based on context", () => {
      // Verify it's consistent (no fallback selection logic)
      const model1 = ProviderConfiguration.getDefaultModel();
      const model2 = ProviderConfiguration.getDefaultModel();

      expect(model1).toBe(model2);
      expect(model1).toBe("arcee-ai/trinity-large-preview:free");
    });
  });

  describe("isKnownModel", () => {
    it("should recognize known openrouter models", () => {
      const knownModels = [
        "arcee-ai/trinity-large-preview:free",
        "llama-3.3-70b-versatile",
        "mistral-large",
      ];

      for (const model of knownModels) {
        expect(
          ProviderConfiguration.isKnownModel("openrouter", model),
        ).toBe(true);
      }
    });

    it("should return false for unknown openrouter models", () => {
      expect(ProviderConfiguration.isKnownModel("openrouter", "unknown-model"))
        .toBe(false);
    });

    it("should allow any model for non-openrouter providers (BYOK)", () => {
      expect(
        ProviderConfiguration.isKnownModel("custom-provider", "any-model"),
      ).toBe(true);
      expect(
        ProviderConfiguration.isKnownModel("user-provided-api", "custom-model"),
      ).toBe(true);
    });
  });

  describe("validateConfig", () => {
    it("should fail if provider is missing", () => {
      const result = ProviderConfiguration.validateConfig("", "some-model");

      expect(result).not.toBeNull();
      expect(result).toContain("Provider");
    });

    it("should fail if model is missing", () => {
      const result = ProviderConfiguration.validateConfig("openrouter", "");

      expect(result).not.toBeNull();
      expect(result).toContain("model");
    });

    it("should fail if both are missing", () => {
      const result = ProviderConfiguration.validateConfig("", "");

      expect(result).not.toBeNull();
      expect(result).toContain("Provider");
      expect(result).toContain("model");
    });

    it("should pass for valid openrouter model", () => {
      const result = ProviderConfiguration.validateConfig(
        "openrouter",
        "arcee-ai/trinity-large-preview:free",
      );

      expect(result).toBeNull();
    });

    it("should fail for unknown openrouter model", () => {
      const result = ProviderConfiguration.validateConfig(
        "openrouter",
        "unknown-model",
      );

      expect(result).not.toBeNull();
    });
  });
});
