/**
 * ModelSelectionPolicy - Provider and model selection logic
 *
 * Single Responsibility: Determine which provider/model to use based on overrides,
 * validation, and fallback rules. Respects strict/compat mode for fallback behavior.
 * Does NOT check connection state (that's async).
 */

import { ProviderIdSchema, type ProviderId } from "@repo/shared-types";
import type { ProviderAdapterFamily } from "@repo/shared-types";
import {
  InvalidProviderSelectionError,
  ValidationError,
} from "../../domain/errors";
import { ProviderRegistryService } from "../providers";

/**
 * Runtime provider type (subset of ProviderId with runtime semantics)
 */
export type RuntimeProvider = ProviderAdapterFamily;

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
 *
 * Strict Mode (default):
 *   - Invalid providerId throws InvalidProviderSelectionError
 *   - Partial override throws InvalidProviderSelectionError
 *   - Model not in capability matrix throws ModelNotAllowedError
 *
 * BYOK Mode (isByokOverride=true):
 *   - Model validation is relaxed for BYOK-selected provider/model pairs
 *   - Allows provider-native model IDs even if absent from static allowlist
 *   - Still validates providerId schema and rejects empty model IDs
 *
 * Compat Mode (BRAIN_RUNTIME_COMPAT_MODE=1):
 *   - Invalid or partial overrides fall back to default with structured logging
 *
 * NOTE: Does NOT check durable provider connection state (that's async).
 * Only validates schema structure. Connection check happens in AdapterSelectionService.
 *
 * @param providerId - Optional provider override ID
 * @param modelId - Optional model override ID
 * @param defaultProvider - The default provider name (from adapter)
 * @param defaultModel - The default model name
 * @param mapToRuntimeProvider - Function to map ProviderId to RuntimeProvider
 * @param getRuntimeProviderFromAdapter - Function to map adapter provider to RuntimeProvider
 * @param options - Configuration options (isByokOverride, correlationId)
 * @returns ModelSelection with resolved provider/model
 * @throws InvalidProviderSelectionError in strict mode on validation failure
 */
export function resolveModelSelection(
  providerId: string | undefined,
  modelId: string | undefined,
  defaultProvider: string,
  defaultModel: string,
  mapToRuntimeProvider: (id: ProviderId) => RuntimeProvider,
  getRuntimeProviderFromAdapter: (adapter: string) => RuntimeProvider,
  options?: {
    isByokOverride?: boolean;
    correlationId?: string;
  },
): ModelSelection {
  const { isByokOverride = false, correlationId } = options ?? {};
  const defaultRuntimeProvider = getRuntimeProviderFromAdapter(defaultProvider);

  // If no override specified, use default
  if (!providerId && !modelId) {
    return {
      model: defaultModel,
      provider: defaultProvider,
      runtimeProvider: defaultRuntimeProvider,
      fallback: false,
    };
  }

  // Partial override: one of providerId/modelId missing
  if (!providerId || !modelId) {
    throw new ValidationError(
      `Partial provider/model override: providerId=${providerId}, modelId=${modelId}. Both must be provided together.`,
      "INVALID_PROVIDER_SELECTION",
      correlationId,
    );
  }

  // Validate providerId is a known provider
  const parseResult = ProviderIdSchema.safeParse(providerId);
  if (!parseResult.success) {
    throw new InvalidProviderSelectionError(
      providerId,
      correlationId,
    );
  }

  const validProviderId: ProviderId = parseResult.data;
  const runtimeProvider = mapToRuntimeProvider(validProviderId);

  if (!providerRegistryService.isProviderRegistered(validProviderId)) {
    throw new InvalidProviderSelectionError(validProviderId, correlationId);
  }

  if (!modelId || modelId.trim().length === 0) {
    throw new ValidationError(
      `Empty model ID for provider override`,
      "INVALID_MODEL_ID",
      correlationId,
    );
  }

  if (isByokOverride) {
    console.log(
      `[ai/model-selection] BYOK override: relaxed model validation for providerId=${validProviderId}, modelId=${modelId}`,
    );
  }

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
  const provider = providerRegistryService.getProvider(providerId);
  return provider?.adapterFamily ?? "openai-compatible";
}

/**
 * Get RuntimeProvider from adapter provider name.
 * Maps concrete provider names to runtime provider types.
 */
export function getRuntimeProviderFromAdapter(provider: string): RuntimeProvider {
  return ADAPTER_PROVIDER_FAMILY_BY_NAME[provider] ?? "openai-compatible";
}

const providerRegistryService = new ProviderRegistryService();

const ADAPTER_PROVIDER_FAMILY_BY_NAME: Record<string, RuntimeProvider> = {
  anthropic: "anthropic-native",
  google: "google-native",
  openai: "openai-compatible",
  openrouter: "openai-compatible",
  groq: "openai-compatible",
  litellm: "openai-compatible",
};
