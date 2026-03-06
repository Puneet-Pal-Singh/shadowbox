import { describe, it, expect } from "vitest";
import { ProviderConfiguration } from "../ProviderConfiguration.js";

/**
 * Tests for Pre-63: Provider-agnostic configuration.
 * Verifies no hardcoded vendor defaults remain.
 */
describe("ProviderConfiguration - No Vendor Defaults", () => {
  describe("No hardcoded constants", () => {
    it("should not define DEFAULT_PROVIDER", () => {
      expect((ProviderConfiguration as Record<string, unknown>)["DEFAULT_PROVIDER"]).toBeUndefined();
    });

    it("should not define DEFAULT_MODEL", () => {
      expect((ProviderConfiguration as Record<string, unknown>)["DEFAULT_MODEL"]).toBeUndefined();
    });

    it("should not define KNOWN_OPENROUTER_MODELS", () => {
      expect((ProviderConfiguration as Record<string, unknown>)["KNOWN_OPENROUTER_MODELS"]).toBeUndefined();
    });

    it("should not have getFallbackModel", () => {
      expect((ProviderConfiguration as Record<string, unknown>)["getFallbackModel"]).toBeUndefined();
    });

    it("should not have getDefaultProvider", () => {
      expect((ProviderConfiguration as Record<string, unknown>)["getDefaultProvider"]).toBeUndefined();
    });

    it("should not have getDefaultModel", () => {
      expect((ProviderConfiguration as Record<string, unknown>)["getDefaultModel"]).toBeUndefined();
    });
  });

  describe("isValidProviderId", () => {
    it("should accept valid slug-format provider IDs", () => {
      expect(ProviderConfiguration.isValidProviderId("openai")).toBe(true);
      expect(ProviderConfiguration.isValidProviderId("my-provider")).toBe(true);
    });

    it("should reject invalid provider IDs", () => {
      expect(ProviderConfiguration.isValidProviderId("")).toBe(false);
      expect(ProviderConfiguration.isValidProviderId("HAS_UPPER")).toBe(false);
    });
  });

  describe("validateConfig", () => {
    it("should pass for any valid slug + non-empty model", () => {
      expect(ProviderConfiguration.validateConfig("openrouter", "any-model")).toBeNull();
      expect(ProviderConfiguration.validateConfig("groq", "llama-3")).toBeNull();
    });

    it("should fail for missing provider or model", () => {
      expect(ProviderConfiguration.validateConfig("", "model")).not.toBeNull();
      expect(ProviderConfiguration.validateConfig("provider", "")).not.toBeNull();
    });
  });
});
