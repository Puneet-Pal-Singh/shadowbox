// packages/execution-engine/src/runtime/provider/ProviderConfiguration.test.ts
// Pre-63: Test provider-agnostic configuration (no hardcoded defaults)

import { describe, it, expect } from "vitest";
import { ProviderConfiguration } from "./ProviderConfiguration.js";

describe("ProviderConfiguration - Provider-Agnostic Validation", () => {
  describe("isValidProviderId", () => {
    it("should accept valid slug provider IDs", () => {
      expect(ProviderConfiguration.isValidProviderId("openrouter")).toBe(true);
      expect(ProviderConfiguration.isValidProviderId("openai")).toBe(true);
      expect(ProviderConfiguration.isValidProviderId("my-custom-provider")).toBe(true);
      expect(ProviderConfiguration.isValidProviderId("groq")).toBe(true);
    });

    it("should reject invalid provider IDs", () => {
      expect(ProviderConfiguration.isValidProviderId("")).toBe(false);
      expect(ProviderConfiguration.isValidProviderId("UPPER")).toBe(false);
      expect(ProviderConfiguration.isValidProviderId("has spaces")).toBe(false);
      expect(ProviderConfiguration.isValidProviderId("special!char")).toBe(false);
    });
  });

  describe("isValidModelId", () => {
    it("should accept non-empty model IDs", () => {
      expect(ProviderConfiguration.isValidModelId("gpt-4")).toBe(true);
      expect(ProviderConfiguration.isValidModelId("claude-3.5-sonnet")).toBe(true);
      expect(ProviderConfiguration.isValidModelId("custom/model:tag")).toBe(true);
    });

    it("should reject empty model ID", () => {
      expect(ProviderConfiguration.isValidModelId("")).toBe(false);
    });

    it("should reject whitespace-only model ID", () => {
      expect(ProviderConfiguration.isValidModelId("   ")).toBe(false);
      expect(ProviderConfiguration.isValidModelId("\t")).toBe(false);
    });

    it("should reject model-unset sentinel", () => {
      expect(ProviderConfiguration.isValidModelId("model-unset")).toBe(false);
    });
  });

  describe("validateConfig", () => {
    it("should accept valid provider/model combination", () => {
      expect(ProviderConfiguration.validateConfig("openai", "gpt-4")).toBeNull();
      expect(ProviderConfiguration.validateConfig("openrouter", "custom/model")).toBeNull();
    });

    it("should reject missing provider or model", () => {
      expect(ProviderConfiguration.validateConfig("", "model")).not.toBeNull();
      expect(ProviderConfiguration.validateConfig("provider", "")).not.toBeNull();
      expect(ProviderConfiguration.validateConfig("", "")).not.toBeNull();
    });

    it("should reject invalid provider ID format", () => {
      const error = ProviderConfiguration.validateConfig("INVALID", "model");
      expect(error).not.toBeNull();
      expect(error).toContain("Invalid provider ID");
    });

    it("should not hardcode any specific provider", () => {
      // Any valid slug should work — no special-casing
      expect(ProviderConfiguration.validateConfig("any-new-provider", "any-model")).toBeNull();
    });
  });

  describe("no hardcoded defaults", () => {
    it("should not have DEFAULT_PROVIDER", () => {
      expect((ProviderConfiguration as Record<string, unknown>)["DEFAULT_PROVIDER"]).toBeUndefined();
    });

    it("should not have DEFAULT_MODEL", () => {
      expect((ProviderConfiguration as Record<string, unknown>)["DEFAULT_MODEL"]).toBeUndefined();
    });

    it("should not have KNOWN_OPENROUTER_MODELS", () => {
      expect((ProviderConfiguration as Record<string, unknown>)["KNOWN_OPENROUTER_MODELS"]).toBeUndefined();
    });
  });
});
