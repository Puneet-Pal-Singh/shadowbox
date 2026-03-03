// packages/execution-engine/src/runtime/provider/ProviderConfiguration.ts
// RCP3: Unified provider/model configuration WITHOUT fallback chains

/**
 * Single source of truth for provider/model defaults across all layers.
 * Prevents selection mismatches and enforces explicit provider/model selection.
 *
 * RCP3 CHANGE: Removed fallback model selection logic.
 * Configuration must be explicit: no silent fallback to alternative models.
 */
export class ProviderConfiguration {
  /**
   * Default platform provider - used when no BYOK override is present
   * Must match what the brain layer accepts
   */
  static readonly DEFAULT_PROVIDER = "openrouter" as const;

  /**
   * Default model on the default provider
   * Used when no explicit model selection is provided
   * This is the ONLY model used when configuration selection is missing
   */
  static readonly DEFAULT_MODEL = "arcee-ai/trinity-large-preview:free" as const;

  /**
   * Well-known open router models that are stable
   */
  static readonly KNOWN_OPENROUTER_MODELS = [
    "arcee-ai/trinity-large-preview:free",
    "llama-3.3-70b-versatile",
    "mistral-large",
    "openai/gpt-4o-mini",
    "openai/gpt-4o",
    "anthropic/claude-3.5-sonnet",
    "grok-2",
  ] as const;

  /**
   * Get the default provider ID
   */
  static getDefaultProvider(): string {
    return this.DEFAULT_PROVIDER;
  }

  /**
   * Get the default model ID
   */
  static getDefaultModel(): string {
    return this.DEFAULT_MODEL;
  }

  /**
   * Check if a model is in the allowlist
   * For platform validation: if it's a known model, allow it
   * If unknown, error rather than silent fallback
   */
  static isKnownModel(
    provider: string,
    model: string,
  ): boolean {
    if (provider === "openrouter") {
      return this.KNOWN_OPENROUTER_MODELS.includes(
        model as (typeof this.KNOWN_OPENROUTER_MODELS)[number],
      );
    }
    // Other providers: assume valid (BYOK)
    return true;
  }

  /**
   * DEPRECATED: getFallbackModel has been removed (RCP3).
   * Use DEFAULT_MODEL instead for explicit, non-fallback selection.
   * 
   * If called, throws error to prevent silent fallback behavior.
   */
  static getFallbackModel(_provider: string): never {
    throw new Error(
      "[provider/config] getFallbackModel is deprecated (RCP3). " +
      "Use DEFAULT_MODEL for explicit non-fallback selection. " +
      "Fallback model chains are no longer supported.",
    );
  }

  /**
   * Validate provider/model combination
   * Returns null if valid, error message if not
   */
  static validateConfig(
    provider: string,
    model: string,
  ): string | null {
    if (!provider || !model) {
      return "Provider and model must both be specified";
    }

    // Platform provider: check allowlist
    if (provider === "openrouter") {
      if (!this.isKnownModel(provider, model)) {
        return `Unknown model "${model}" for provider "${provider}". Use one of: ${this.KNOWN_OPENROUTER_MODELS.join(", ")}`;
      }
    }

    // BYOK providers: minimal validation (user knows what they're doing)
    return null;
  }
}
