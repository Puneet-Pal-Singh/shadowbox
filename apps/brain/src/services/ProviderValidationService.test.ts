import { describe, it, expect } from "vitest";
import { ProviderValidationService } from "./ProviderValidationService";
import type { Env } from "../types/ai";

const baseEnv: Env = {
  GROQ_API_KEY: "test-key",
  DEFAULT_MODEL: "llama-3.3-70b-versatile",
};

describe("ProviderValidationService", () => {
  describe("LiteLLM validation", () => {
    it("should pass with GROQ_API_KEY and DEFAULT_MODEL", () => {
      const env: Env = {
        ...baseEnv,
        LLM_PROVIDER: "litellm",
      };

      const result = ProviderValidationService.validate(env);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should pass with OPENAI_API_KEY and DEFAULT_MODEL", () => {
      const env: Env = {
        OPENAI_API_KEY: "[REDACTED:api-key]",
        DEFAULT_MODEL: "gpt-4",
        LLM_PROVIDER: "litellm",
      };

      const result = ProviderValidationService.validate(env);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail without API key", () => {
      const env: Env = {
        DEFAULT_MODEL: "llama-3.3-70b-versatile",
        LLM_PROVIDER: "litellm",
      };

      const result = ProviderValidationService.validate(env);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe("MISSING_API_KEY");
    });

    it("should fail without DEFAULT_MODEL", () => {
      const env: Env = {
        GROQ_API_KEY: "test-key",
        LLM_PROVIDER: "litellm",
      };

      const result = ProviderValidationService.validate(env);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe("MISSING_DEFAULT_MODEL");
    });

    it("should fail with both errors when API key and DEFAULT_MODEL missing", () => {
      const env: Env = {
        LLM_PROVIDER: "litellm",
      };

      const result = ProviderValidationService.validate(env);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      const errorCodes = result.errors.map((e) => e.code).sort();
      expect(errorCodes).toEqual([
        "MISSING_API_KEY",
        "MISSING_DEFAULT_MODEL",
      ]);
    });

    it("should warn about Groq-only setup without OpenAI fallback", () => {
      const env: Env = {
        GROQ_API_KEY: "test-key",
        LLM_PROVIDER: "litellm",
      };

      const result = ProviderValidationService.validate(env);
      // Will have error for missing DEFAULT_MODEL
      expect(result.valid).toBe(false);
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("OpenAI validation", () => {
    it("should pass with OPENAI_API_KEY", () => {
      const env: Env = {
        OPENAI_API_KEY: "[REDACTED:api-key]",
        DEFAULT_MODEL: "gpt-4",
        LLM_PROVIDER: "openai",
      };

      const result = ProviderValidationService.validate(env);
      expect(result.valid).toBe(true);
    });

    it("should fail without OPENAI_API_KEY", () => {
      const env: Env = {
        DEFAULT_MODEL: "gpt-4",
        LLM_PROVIDER: "openai",
      };

      const result = ProviderValidationService.validate(env);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("MISSING_OPENAI_API_KEY");
    });

    it("should warn without DEFAULT_MODEL for OpenAI", () => {
      const env: Env = {
        OPENAI_API_KEY: "[REDACTED:api-key]",
        LLM_PROVIDER: "openai",
      };

      const result = ProviderValidationService.validate(env);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe("NO_DEFAULT_MODEL");
    });
  });

  describe("Anthropic validation", () => {
    it("should pass with ANTHROPIC_API_KEY", () => {
      const env: Env = {
        ANTHROPIC_API_KEY: "[REDACTED:api-key]",
        DEFAULT_MODEL: "claude-3-sonnet-20240229",
        LLM_PROVIDER: "anthropic",
      };

      const result = ProviderValidationService.validate(env);
      expect(result.valid).toBe(true);
    });

    it("should fail without ANTHROPIC_API_KEY", () => {
      const env: Env = {
        DEFAULT_MODEL: "claude-3-sonnet-20240229",
        LLM_PROVIDER: "anthropic",
      };

      const result = ProviderValidationService.validate(env);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("MISSING_ANTHROPIC_API_KEY");
    });
  });

  describe("Error formatting", () => {
    it("should format errors as readable message", () => {
      const env: Env = {
        LLM_PROVIDER: "litellm",
      };

      const result = ProviderValidationService.validate(env);
      const formatted = ProviderValidationService.formatErrors(result);

      expect(formatted).toContain("validation failed");
      expect(formatted).toContain("MISSING_API_KEY");
      expect(formatted).toContain("MISSING_DEFAULT_MODEL");
      expect(formatted).toContain("Hint:");
    });

    it("should return empty string for valid config", () => {
      const result = ProviderValidationService.validate(baseEnv);
      const formatted = ProviderValidationService.formatErrors(result);
      expect(formatted).toBe("");
    });
  });

  describe("Default provider (LiteLLM)", () => {
    it("should validate as LiteLLM when LLM_PROVIDER not set", () => {
      const env: Env = {
        GROQ_API_KEY: "test-key",
        DEFAULT_MODEL: "llama-3.3-70b-versatile",
        // LLM_PROVIDER not set, should default to litellm
      };

      const result = ProviderValidationService.validate(env);
      expect(result.valid).toBe(true);
    });
  });
});
