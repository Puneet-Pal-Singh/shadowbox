import { describe, it, expect } from "vitest";
import { ProviderValidationService } from "../ProviderValidationService.js";
import type { Env } from "../../types/ai.js";

/**
 * Tests for provider validation: extensible provider support.
 * 
 * Verifies that unknown/custom providers are accepted with warnings
 * (no code edit needed to add new providers), while built-in providers
 * get specific validation.
 */
describe("ProviderValidationService - Extensible Provider Validation", () => {
  const createValidEnv = (): Env => ({
    SESSION_SECRET: "test-secret-key-32-bytes-long!!",
    GITHUB_CLIENT_ID: "test-client-id",
    GITHUB_CLIENT_SECRET: "test-client-secret",
    BYOK_CREDENTIAL_ENCRYPTION_KEY: "test-encryption-key",
    LLM_PROVIDER: "litellm",
  });

  describe("Unknown Provider Handling", () => {
    it("should reject unknown provider with error", () => {
      const env = {
        ...createValidEnv(),
        LLM_PROVIDER: "unknown-provider",
        DEFAULT_MODEL: "some-model",
      };

      const result = ProviderValidationService.validate(env);

      expect(result.valid).toBe(false);

      const unknownError = result.errors.find(
        (e) => e.code === "UNKNOWN_PROVIDER",
      );
      expect(unknownError).toBeDefined();
      expect(unknownError?.severity).toBe("error");
      expect(unknownError?.hint).toContain("litellm");
    });

    it("should reject typo provider with error", () => {
      const env = {
        ...createValidEnv(),
        LLM_PROVIDER: "opnai",
      };

      const result = ProviderValidationService.validate(env);

      expect(result.valid).toBe(false);
      expect(result.errors.find((e) => e.code === "UNKNOWN_PROVIDER")).toBeDefined();
    });
  });

  describe("Supported Providers", () => {
    it("should validate litellm provider", () => {
      const env = {
        ...createValidEnv(),
        LLM_PROVIDER: "litellm",
      };

      const result = ProviderValidationService.validate(env);

      // Should not have custom provider warning
      const customWarning = result.warnings.find(
        (w) => w.code === "CUSTOM_PROVIDER",
      );
      expect(customWarning).toBeUndefined();
    });

    it("should validate openai provider", () => {
      const env = {
        ...createValidEnv(),
        LLM_PROVIDER: "openai",
      };

      const result = ProviderValidationService.validate(env);

      // Should not have custom provider warning
      const customWarning = result.warnings.find(
        (w) => w.code === "CUSTOM_PROVIDER",
      );
      expect(customWarning).toBeUndefined();
    });

    it("should validate anthropic provider", () => {
      const env = {
        ...createValidEnv(),
        LLM_PROVIDER: "anthropic",
      };

      const result = ProviderValidationService.validate(env);

      // Should not have custom provider warning
      const customWarning = result.warnings.find(
        (w) => w.code === "CUSTOM_PROVIDER",
      );
      expect(customWarning).toBeUndefined();
    });
  });

  describe("Critical Security Configuration", () => {
    it("should still enforce SESSION_SECRET requirement", () => {
      const env = createValidEnv();
      delete env.SESSION_SECRET;

      const result = ProviderValidationService.validate(env);

      expect(result.valid).toBe(false);
      const sessionError = result.errors.find(
        (e) => e.code === "MISSING_SESSION_SECRET",
      );
      expect(sessionError).toBeDefined();
    });

    it("should still enforce GitHub OAuth requirement", () => {
      const env = createValidEnv();
      delete env.GITHUB_CLIENT_ID;

      const result = ProviderValidationService.validate(env);

      expect(result.valid).toBe(false);
      const githubError = result.errors.find(
        (e) => e.code === "MISSING_GITHUB_OAUTH",
      );
      expect(githubError).toBeDefined();
    });
  });

  describe("No Fallback Chains", () => {
    it("should not describe fallback-first behavior in error hints", () => {
      const env = {
        ...createValidEnv(),
        LLM_PROVIDER: "unknown",
      };

      const result = ProviderValidationService.validate(env);

      const unknownError = result.errors.find(
        (e) => e.code === "UNKNOWN_PROVIDER",
      );
      expect(unknownError).toBeDefined();
      expect(unknownError?.hint).not.toContain("fallback");
    });
  });
});
