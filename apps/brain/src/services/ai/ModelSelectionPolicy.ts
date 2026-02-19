/**
 * ModelSelectionPolicy - Provider and model selection logic
 *
 * Single Responsibility: Determine which provider/model to use based on overrides,
 * validation, and fallback rules. Does NOT check connection state (that's async).
 */

import { ProviderIdSchema, type ProviderId } from "../../schemas/provider";

/**
 * Runtime provider type (subset of ProviderId with runtime semantics)
 */
export type RuntimeProvider =
  | "litellm"
  | "openai"
  | "anthropic"
  | "openrouter"
  | "groq";

/**
 * Model selection result with provider and fallback information
 */
export interface ModelSelection {
  model: string;
  provider: string;
  runtimeProvider: RuntimeProvider;
  fallback: boolean;
  providerId?: ProviderId;
}

/**
 * Resolve provider/model override selection.
 * Returns the model to use, falling back to default if selection is invalid.
 *
 * Logic:
 * 1. If providerId + modelId provided AND valid -> use selection (no connection check yet)
 * 2. Otherwise log warning and fallback to default model
 *
 * NOTE: Does NOT check durable provider connection state (that's async).
 * Only validates schema structure.
 *
 * @param providerId - Optional provider override ID
 * @param modelId - Optional model override ID
 * @param defaultProvider - The default provider name (from adapter)
 * @param defaultModel - The default model name
 * @param mapToRuntimeProvider - Function to map ProviderId to RuntimeProvider
 * @param getRuntimeProviderFromAdapter - Function to map adapter provider to RuntimeProvider
 * @returns ModelSelection with resolved provider/model
 */
export function resolveModelSelection(
  providerId: string | undefined,
  modelId: string | undefined,
  defaultProvider: string,
  defaultModel: string,
  mapToRuntimeProvider: (id: ProviderId) => RuntimeProvider,
  getRuntimeProviderFromAdapter: (adapter: string) => RuntimeProvider,
): ModelSelection {
  const defaultRuntimeProvider = getRuntimeProviderFromAdapter(defaultProvider);

  // If no override specified, use default
  if (!providerId || !modelId) {
    return {
      model: defaultModel,
      provider: defaultProvider,
      runtimeProvider: defaultRuntimeProvider,
      fallback: false,
    };
  }

  // Validate providerId is a known provider
  const parseResult = ProviderIdSchema.safeParse(providerId);
  if (!parseResult.success) {
    console.warn(
      `[ai/model-selection] Invalid providerId: ${providerId}. Falling back to default model=${defaultModel}`,
    );
    return {
      model: defaultModel,
      provider: defaultProvider,
      runtimeProvider: defaultRuntimeProvider,
      fallback: true,
    };
  }

  const validProviderId: ProviderId = parseResult.data;
  const runtimeProvider = mapToRuntimeProvider(validProviderId);

  // Attempt to use provider override (actual connection check happens later)
  console.log(
    `[ai/model-selection] Attempting provider override: providerId=${validProviderId}, modelId=${modelId}`,
  );
  return {
    model: modelId,
    provider: validProviderId,
    runtimeProvider,
    fallback: false,
    providerId: validProviderId,
  };
}

/**
 * Map ProviderId to RuntimeProvider.
 * Exhaustive match to catch unknown providers.
 */
export function mapProviderIdToRuntimeProvider(
  providerId: ProviderId,
): RuntimeProvider {
  switch (providerId) {
    case "openrouter":
      return "openrouter";
    case "groq":
      return "groq";
    case "openai":
      return "openai";
    default: {
      const _exhaustive: never = providerId;
      return _exhaustive;
    }
  }
}

/**
 * Get RuntimeProvider from adapter provider name.
 * Maps concrete provider names to runtime provider types.
 */
export function getRuntimeProviderFromAdapter(provider: string): RuntimeProvider {
  if (provider === "openai" || provider === "anthropic") {
    return provider as RuntimeProvider;
  }
  return "litellm";
}
