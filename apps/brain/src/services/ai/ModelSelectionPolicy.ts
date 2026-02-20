/**
 * ModelSelectionPolicy - Provider and model selection logic
 *
 * Single Responsibility: Determine which provider/model to use based on overrides,
 * validation, and fallback rules. Respects strict/compat mode for fallback behavior.
 * Does NOT check connection state (that's async).
 */

import { ProviderIdSchema, type ProviderId } from "../../schemas/provider";
import {
  InvalidProviderSelectionError,
  ModelNotAllowedError,
  ValidationError,
} from "../../domain/errors";
import { isStrictMode, logCompatFallback, CompatFallbackReasonCodes } from "../../config/runtime-compat";
import { PROVIDER_CATALOG } from "../providers/catalog";

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
 *
 * Strict Mode (default):
 *   - Invalid providerId throws InvalidProviderSelectionError
 *   - Partial override throws InvalidProviderSelectionError
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
 * @param correlationId - Optional correlation ID for error tracking
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
  correlationId?: string,
): ModelSelection {
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
    if (isStrictMode()) {
      throw new ValidationError(
        `Partial provider/model override: providerId=${providerId}, modelId=${modelId}. Both must be provided together.`,
        "PARTIAL_OVERRIDE",
        correlationId,
      );
    }
    // Compat mode: log and fallback
    logCompatFallback({
      reasonCode: CompatFallbackReasonCodes.PROVIDER_SELECTION_DEFAULTED,
      requestedProvider: providerId,
      requestedModel: modelId,
      resolvedProvider: defaultProvider,
      resolvedModel: defaultModel,
      runId: correlationId,
    });
    return {
      model: defaultModel,
      provider: defaultProvider,
      runtimeProvider: defaultRuntimeProvider,
      fallback: true,
    };
  }

  // Validate providerId is a known provider
  const parseResult = ProviderIdSchema.safeParse(providerId);
  if (!parseResult.success) {
    if (isStrictMode()) {
      throw new InvalidProviderSelectionError(
        providerId,
        correlationId,
      );
    }
    // Compat mode: log and fallback
    logCompatFallback({
      reasonCode: CompatFallbackReasonCodes.PROVIDER_SELECTION_DEFAULTED,
      requestedProvider: providerId,
      requestedModel: modelId,
      resolvedProvider: defaultProvider,
      resolvedModel: defaultModel,
      runId: correlationId,
    });
    return {
      model: defaultModel,
      provider: defaultProvider,
      runtimeProvider: defaultRuntimeProvider,
      fallback: true,
    };
  }

  const validProviderId: ProviderId = parseResult.data;
  const runtimeProvider = mapToRuntimeProvider(validProviderId);
  const isAllowedModel = isModelAllowedForProvider(validProviderId, modelId);

  if (!isAllowedModel) {
    if (isStrictMode()) {
      throw new ModelNotAllowedError(modelId, validProviderId, correlationId);
    }

    logCompatFallback({
      reasonCode: CompatFallbackReasonCodes.MODEL_SELECTION_DEFAULTED,
      requestedProvider: validProviderId,
      requestedModel: modelId,
      resolvedProvider: defaultProvider,
      resolvedModel: defaultModel,
      runId: correlationId,
    });
    return {
      model: defaultModel,
      provider: defaultProvider,
      runtimeProvider: defaultRuntimeProvider,
      fallback: true,
    };
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

function isModelAllowedForProvider(providerId: ProviderId, modelId: string): boolean {
  return PROVIDER_CATALOG[providerId].some((model) => model.id === modelId);
}
