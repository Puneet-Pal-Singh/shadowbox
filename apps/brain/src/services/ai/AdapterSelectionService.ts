/**
 * AdapterSelectionService - Select and instantiate adapters
 *
 * Single Responsibility: Choose the right adapter based on selection info
 * and provider config state. Enforces strict mode for provider connectivity.
 *
 * Strict Mode (default):
 *   - If provider is not connected, throws ProviderNotConnectedError
 *
 * Compat Mode (BRAIN_RUNTIME_COMPAT_MODE=1):
 *   - Falls back to default adapter with structured logging
 */

import type { ProviderAdapter } from "../providers";
import type { ProviderConfigService } from "../providers";
import type {
  ModelSelection,
  RuntimeProvider,
} from "./ModelSelectionPolicy";
import {
  getRuntimeProviderFromAdapter,
} from "./ModelSelectionPolicy";
import {
  createOpenAIAdapter,
  createAnthropicAdapter,
  createOpenRouterAdapter,
  createGroqAdapter,
  createLiteLLMAdapter,
} from "./ProviderAdapterFactory";
import type { Env } from "../../types/ai";
import {
  ProviderNotConnectedError,
} from "../../domain/errors";
import { isStrictMode, logCompatFallback, CompatFallbackReasonCodes } from "../../config/runtime-compat";

/**
 * Get the appropriate adapter for a model selection.
 *
 * Strict Mode (default):
 *   - If selection specifies a provider, must be connected
 *   - Throws ProviderNotConnectedError if not connected
 *
 * Compat Mode (BRAIN_RUNTIME_COMPAT_MODE=1):
 *   - Falls back to default adapter if provider not connected
 *   - Logs fallback with structured reason code
 *
 * @param selection - The model selection result
 * @param defaultAdapter - The default adapter instance
 * @param env - Cloudflare environment
 * @param providerConfigService - Optional service for BYOK keys
 * @param correlationId - Optional correlation ID for error tracking
 * @returns The selected adapter
 * @throws ProviderNotConnectedError in strict mode if provider not connected
 */
export async function selectAdapter(
  selection: ModelSelection,
  defaultAdapter: ProviderAdapter,
  env: Env,
  providerConfigService?: ProviderConfigService,
  correlationId?: string,
): Promise<ProviderAdapter> {
  // If fallback mode or same as default, use default
  if (
    selection.fallback ||
    selection.runtimeProvider ===
      getRuntimeProviderFromAdapter(defaultAdapter.provider)
  ) {
    return defaultAdapter;
  }

  // Try to get override API key if provider was specified
  const overrideApiKey = selection.providerId
    ? ((await providerConfigService?.getApiKey(selection.providerId)) ??
      undefined)
    : undefined;

  // Provider was selected but not connected
  if (!overrideApiKey) {
    if (isStrictMode()) {
      throw new ProviderNotConnectedError(
        selection.providerId ?? selection.runtimeProvider,
        correlationId,
      );
    }

    // Compat mode: log and fallback to default
    logCompatFallback({
      reasonCode: CompatFallbackReasonCodes.PROVIDER_ADAPTER_DEFAULTED,
      requestedProvider: selection.providerId ?? selection.runtimeProvider,
      resolvedProvider: defaultAdapter.provider,
      requestedModel: selection.model,
      resolvedModel: selection.model, // Use requested model as resolved since we're falling back
      runId: correlationId,
    });
    return defaultAdapter;
  }

  // Create adapter with override key
  return createAdapterForProvider(
    selection.runtimeProvider,
    env,
    overrideApiKey,
  );
}

/**
 * Create an adapter for a specific runtime provider.
 * @param provider - The runtime provider type
 * @param env - Cloudflare environment
 * @param overrideApiKey - The API key to use
 * @returns Configured ProviderAdapter
 */
function createAdapterForProvider(
  provider: RuntimeProvider,
  env: Env,
  overrideApiKey: string,
): ProviderAdapter {
  switch (provider) {
    case "openai":
      return createOpenAIAdapter(env, overrideApiKey);
    case "anthropic":
      return createAnthropicAdapter(env, overrideApiKey);
    case "openrouter":
      return createOpenRouterAdapter(overrideApiKey);
    case "groq":
      return createGroqAdapter(overrideApiKey);
    case "litellm":
    default:
      return createLiteLLMAdapter(env, overrideApiKey);
  }
}
