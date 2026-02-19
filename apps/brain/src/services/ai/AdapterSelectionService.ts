/**
 * AdapterSelectionService - Select and instantiate adapters
 *
 * Single Responsibility: Choose the right adapter based on selection info
 * and provider config state. Handles fallback logic.
 */

import type { ProviderAdapter } from "../providers";
import type { ProviderConfigService } from "../ProviderConfigService";
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

/**
 * Get the appropriate adapter for a model selection.
 *
 * Logic:
 * 1. If fallback mode, return default adapter
 * 2. If selection matches default adapter, return default
 * 3. Try to get provider key from config service
 * 4. If no key, log warning and return default
 * 5. Otherwise create adapter with override key
 *
 * @param selection - The model selection result
 * @param defaultAdapter - The default adapter instance
 * @param env - Cloudflare environment
 * @param providerConfigService - Optional service for BYOK keys
 * @returns The selected adapter
 */
export async function selectAdapter(
  selection: ModelSelection,
  defaultAdapter: ProviderAdapter,
  env: Env,
  providerConfigService?: ProviderConfigService,
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

  // For all providers, fall back to default if no explicit override key provided
  // This ensures BYOK providers are explicitly connected before use
  if (!overrideApiKey) {
    console.warn(
      `[ai/adapter-selection] Provider ${selection.runtimeProvider} not connected, falling back to default adapter`,
    );
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
