// packages/execution-engine/src/runtime/provider/ProviderConfiguration.ts
// Pre-63: Provider-agnostic configuration — no hardcoded provider/model defaults

/**
 * Provider/model configuration validation.
 *
 * Does NOT define default provider or model — those must come from
 * environment configuration or user BYOK preferences.
 * Runtime refuses to guess; missing config is an explicit error.
 */

const PROVIDER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class ProviderConfiguration {
  /**
   * Validate a provider ID matches the slug pattern.
   */
  static isValidProviderId(providerId: string): boolean {
    return PROVIDER_ID_PATTERN.test(providerId);
  }

  /**
   * Validate a model ID is non-empty.
   */
  static isValidModelId(modelId: string): boolean {
    return modelId.length > 0;
  }

  /**
   * Validate provider/model combination.
   * Returns null if valid, error message if not.
   */
  static validateConfig(
    provider: string,
    model: string,
  ): string | null {
    if (!provider || !model) {
      return "Provider and model must both be specified";
    }

    if (!this.isValidProviderId(provider)) {
      return `Invalid provider ID "${provider}". Must match pattern: lowercase alphanumeric with hyphens.`;
    }

    if (!this.isValidModelId(model)) {
      return `Invalid model ID: model must be a non-empty string.`;
    }

    return null;
  }
}
