/**
 * ProviderValidationService - Preflight validation for LLM provider configuration
 *
 * This service runs preflight checks on the environment configuration before
 * attempting to initialize LLM providers. It provides:
 * 1. Early detection of missing configuration (fail-fast)
 * 2. Structured error messages suitable for UI diagnostics
 * 3. Clear actionable guidance for misconfiguration
 *
 * Design: Runs at startup and before chat execution to prevent 500 errors
 * with missing or invalid provider configuration.
 */

import type { Env } from "../types/ai";

export interface ValidationError {
  code: string;
  message: string;
  severity: "error" | "warning";
  hint: string;
}

export interface ProviderValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export class ProviderValidationService {
  /**
   * Validate provider configuration for the given environment
   * Returns structured errors that can be presented to users
   */
  static validate(env: Env): ProviderValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const provider = env.LLM_PROVIDER ?? "litellm";

    // Check required env vars based on provider type
    switch (provider) {
      case "litellm":
        this.validateLiteLLM(env, errors, warnings);
        break;
      case "openai":
        this.validateOpenAI(env, errors, warnings);
        break;
      case "anthropic":
        this.validateAnthropic(env, errors, warnings);
        break;
      default:
        errors.push({
          code: "UNKNOWN_PROVIDER",
          message: `Unknown LLM provider: ${provider}`,
          severity: "error",
          hint: `Set LLM_PROVIDER to one of: litellm, openai, anthropic`,
        });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get a human-readable summary of validation errors
   * Suitable for logging and API error responses
   */
  static formatErrors(result: ProviderValidationResult): string {
    if (result.valid) {
      return "";
    }

    const lines: string[] = [];
    lines.push("Provider configuration validation failed:");
    lines.push("");

    for (const error of result.errors) {
      lines.push(`✗ [${error.code}] ${error.message}`);
      lines.push(`  Hint: ${error.hint}`);
      lines.push("");
    }

    if (result.warnings.length > 0) {
      lines.push("Warnings:");
      for (const warning of result.warnings) {
        lines.push(`⚠ [${warning.code}] ${warning.message}`);
        lines.push(`  Hint: ${warning.hint}`);
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  private static validateLiteLLM(
    env: Env,
    errors: ValidationError[],
    warnings: ValidationError[],
  ): void {
    const hasGroqKey = !!env.GROQ_API_KEY;
    const hasOpenAIKey = !!env.OPENAI_API_KEY;

    if (!hasGroqKey && !hasOpenAIKey) {
      errors.push({
        code: "MISSING_API_KEY",
        message: "LiteLLM provider requires API key",
        severity: "error",
        hint: "Set GROQ_API_KEY (preferred) or OPENAI_API_KEY in your .dev.vars or environment",
      });
    }

    if (!env.DEFAULT_MODEL) {
      errors.push({
        code: "MISSING_DEFAULT_MODEL",
        message: "DEFAULT_MODEL is required for LiteLLM provider",
        severity: "error",
        hint: "Set DEFAULT_MODEL to a valid model (e.g., llama-3.3-70b-versatile for Groq)",
      });
    }

    if (hasGroqKey && !hasOpenAIKey && !env.DEFAULT_MODEL) {
      warnings.push({
        code: "GROQ_ONLY",
        message: "Using Groq API key without OpenAI fallback",
        severity: "warning",
        hint: "If Groq rate limit is hit, chat will fail. Consider adding OPENAI_API_KEY",
      });
    }
  }

  private static validateOpenAI(
    env: Env,
    errors: ValidationError[],
    warnings: ValidationError[],
  ): void {
    if (!env.OPENAI_API_KEY) {
      errors.push({
        code: "MISSING_OPENAI_API_KEY",
        message: "OpenAI provider requires OPENAI_API_KEY",
        severity: "error",
        hint: "Set OPENAI_API_KEY in your .dev.vars or environment",
      });
    }

    if (!env.DEFAULT_MODEL) {
      warnings.push({
        code: "NO_DEFAULT_MODEL",
        message: "DEFAULT_MODEL not set for OpenAI provider",
        severity: "warning",
        hint: "Will use hardcoded fallback. Set DEFAULT_MODEL for explicit model selection (e.g., gpt-4)",
      });
    }
  }

  private static validateAnthropic(
    env: Env,
    errors: ValidationError[],
    warnings: ValidationError[],
  ): void {
    if (!env.ANTHROPIC_API_KEY) {
      errors.push({
        code: "MISSING_ANTHROPIC_API_KEY",
        message: "Anthropic provider requires ANTHROPIC_API_KEY",
        severity: "error",
        hint: "Set ANTHROPIC_API_KEY in your .dev.vars or environment",
      });
    }

    if (!env.DEFAULT_MODEL) {
      warnings.push({
        code: "NO_DEFAULT_MODEL",
        message: "DEFAULT_MODEL not set for Anthropic provider",
        severity: "warning",
        hint: "Will use hardcoded fallback. Set DEFAULT_MODEL for explicit model selection (e.g., claude-3-sonnet-20240229)",
      });
    }
  }
}
