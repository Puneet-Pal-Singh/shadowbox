import { describe, it, expect } from "vitest";
import { ProviderValidationService } from "../ProviderValidationService.js";
import type { Env } from "../../types/ai.js";

/**
 * Tests for RCP3: Fallback removal and explicit failure semantics.
 * 
 * Verifies that invalid/unknown provider configurations fail fast
 * with typed errors, not silent fallback behavior.
 */
describe("ProviderValidationService - RCP3: No Silent Fallbacks", () => {
  const createValidEnv = (): Env => ({
    SESSION_SECRET: "test-secret-key-32-bytes-long!!",
    GITHUB_CLIENT_ID: "test-client-id",
    GITHUB_CLIENT_SECRET: "test-client-secret",
    LLM_PROVIDER: "litellm",
  });

  describe("Unknown Provider Handling", () => {
    it("should error on unknown provider (RCP3 strict mode)", () => {
      const env = {
        ...createValidEnv(),
        LLM_PROVIDER: "unknown-provider",
      };

      const result = ProviderValidationService.validate(env);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const unknownProviderError = result.errors.find(
        (e) => e.code === "UNKNOWN_PROVIDER",
      );
      expect(unknownProviderError).toBeDefined();
      expect(unknownProviderError?.severity).toBe("error");
      expect(unknownProviderError?.message).toContain("Unknown or unsupported");
    });

    it("should not silently fallback to default for unknown provider", () => {
      const env = {
        ...createValidEnv(),
        LLM_PROVIDER: "invalid-custom-provider",
      };

      const result = ProviderValidationService.validate(env);

      // Should be invalid, not valid with warnings
      expect(result.valid).toBe(false);

      // Should not have success path
      const hasSuccessWarnings = result.warnings.some(
        (w) => w.code === "UNKNOWN_PROVIDER",
      );
      expect(hasSuccessWarnings).toBe(false);
    });
  });

  describe("Supported Providers", () => {
    it("should validate litellm provider", () => {
      const env = {
        ...createValidEnv(),
        LLM_PROVIDER: "litellm",
      };

      const result = ProviderValidationService.validate(env);

      // Should not have unknown provider error
      const unknownError = result.errors.find(
        (e) => e.code === "UNKNOWN_PROVIDER",
      );
      expect(unknownError).toBeUndefined();
    });

    it("should validate openai provider", () => {
      const env = {
        ...createValidEnv(),
        LLM_PROVIDER: "openai",
      };

      const result = ProviderValidationService.validate(env);

      // Should not have unknown provider error
      const unknownError = result.errors.find(
        (e) => e.code === "UNKNOWN_PROVIDER",
      );
      expect(unknownError).toBeUndefined();
    });

    it("should validate anthropic provider", () => {
      const env = {
        ...createValidEnv(),
        LLM_PROVIDER: "anthropic",
      };

      const result = ProviderValidationService.validate(env);

      // Should not have unknown provider error
      const unknownError = result.errors.find(
        (e) => e.code === "UNKNOWN_PROVIDER",
      );
      expect(unknownError).toBeUndefined();
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
    it("should not describe fallback-first behavior in hints", () => {
      const env = {
        ...createValidEnv(),
        LLM_PROVIDER: "unknown",
      };

      const result = ProviderValidationService.validate(env);

      // Check that error hints don't mention fallback behavior
      const unknownError = result.errors.find(
        (e) => e.code === "UNKNOWN_PROVIDER",
      );
      expect(unknownError?.message).not.toContain("fallback");
      expect(unknownError?.message).not.toContain("default");
      expect(unknownError?.message).not.toContain("will use");
    });
  });
});
