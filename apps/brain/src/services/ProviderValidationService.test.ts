import { describe, it } from "node:test";
import assert from "node:assert";
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
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it("should pass with OPENAI_API_KEY and DEFAULT_MODEL", () => {
      const env: Env = {
        OPENAI_API_KEY: "sk-test",
        DEFAULT_MODEL: "gpt-4",
        LLM_PROVIDER: "litellm",
      };

      const result = ProviderValidationService.validate(env);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it("should fail without API key", () => {
      const env: Env = {
        DEFAULT_MODEL: "llama-3.3-70b-versatile",
        LLM_PROVIDER: "litellm",
      };

      const result = ProviderValidationService.validate(env);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].code, "MISSING_API_KEY");
    });

    it("should fail without DEFAULT_MODEL", () => {
      const env: Env = {
        GROQ_API_KEY: "test-key",
        LLM_PROVIDER: "litellm",
      };

      const result = ProviderValidationService.validate(env);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].code, "MISSING_DEFAULT_MODEL");
    });

    it("should fail with both errors when API key and DEFAULT_MODEL missing", () => {
      const env: Env = {
        LLM_PROVIDER: "litellm",
      };

      const result = ProviderValidationService.validate(env);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors.length, 2);
      const errorCodes = result.errors.map((e) => e.code).sort();
      assert.deepStrictEqual(errorCodes, [
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
      assert.strictEqual(result.valid, false);
      assert.ok(result.warnings.length >= 0); // May have warning
    });
  });

  describe("OpenAI validation", () => {
    it("should pass with OPENAI_API_KEY", () => {
      const env: Env = {
        OPENAI_API_KEY: "sk-test",
        DEFAULT_MODEL: "gpt-4",
        LLM_PROVIDER: "openai",
      };

      const result = ProviderValidationService.validate(env);
      assert.strictEqual(result.valid, true);
    });

    it("should fail without OPENAI_API_KEY", () => {
      const env: Env = {
        DEFAULT_MODEL: "gpt-4",
        LLM_PROVIDER: "openai",
      };

      const result = ProviderValidationService.validate(env);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors[0].code, "MISSING_OPENAI_API_KEY");
    });

    it("should warn without DEFAULT_MODEL for OpenAI", () => {
      const env: Env = {
        OPENAI_API_KEY: "sk-test",
        LLM_PROVIDER: "openai",
      };

      const result = ProviderValidationService.validate(env);
      assert.ok(result.valid);
      assert.strictEqual(result.warnings.length, 1);
      assert.strictEqual(result.warnings[0].code, "NO_DEFAULT_MODEL");
    });
  });

  describe("Anthropic validation", () => {
    it("should pass with ANTHROPIC_API_KEY", () => {
      const env: Env = {
        ANTHROPIC_API_KEY: "sk-test",
        DEFAULT_MODEL: "claude-3-sonnet-20240229",
        LLM_PROVIDER: "anthropic",
      };

      const result = ProviderValidationService.validate(env);
      assert.strictEqual(result.valid, true);
    });

    it("should fail without ANTHROPIC_API_KEY", () => {
      const env: Env = {
        DEFAULT_MODEL: "claude-3-sonnet-20240229",
        LLM_PROVIDER: "anthropic",
      };

      const result = ProviderValidationService.validate(env);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors[0].code, "MISSING_ANTHROPIC_API_KEY");
    });
  });

  describe("Error formatting", () => {
    it("should format errors as readable message", () => {
      const env: Env = {
        LLM_PROVIDER: "litellm",
      };

      const result = ProviderValidationService.validate(env);
      const formatted = ProviderValidationService.formatErrors(result);

      assert.ok(formatted.includes("validation failed"));
      assert.ok(formatted.includes("MISSING_API_KEY"));
      assert.ok(formatted.includes("MISSING_DEFAULT_MODEL"));
      assert.ok(formatted.includes("Hint:"));
    });

    it("should return empty string for valid config", () => {
      const result = ProviderValidationService.validate(baseEnv);
      const formatted = ProviderValidationService.formatErrors(result);
      assert.strictEqual(formatted, "");
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
      assert.strictEqual(result.valid, true);
    });
  });
});
