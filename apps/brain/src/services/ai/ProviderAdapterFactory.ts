/**
 * ProviderAdapterFactory - Build provider adapters for inference
 *
 * Single Responsibility: Create and configure provider adapters.
 * Encapsulates adapter instantiation logic, removing it from AIService.
 */

import type { Env } from "../../types/ai";
import {
  LiteLLMAdapter,
  OpenAIAdapter,
  AnthropicAdapter,
  type ProviderAdapter,
  ProviderError,
} from "../providers";
import {
  resolveOpenAIKey,
  resolveAnthropicKey,
  resolveOpenRouterKey,
  resolveGroqKey,
  resolveLiteLLMKey,
} from "./ProviderKeyValidator";

/**
 * Build the default provider adapter based on env configuration.
 *
 * @param env - Cloudflare environment
 * @returns Configured ProviderAdapter
 * @throws ProviderError if provider is unknown or required env vars are missing
 */
export function createDefaultAdapter(env: Env): ProviderAdapter {
  const provider = env.LLM_PROVIDER ?? "litellm";

  switch (provider) {
    case "litellm":
      return createLiteLLMAdapter(env);

    case "openai":
      return createOpenAIAdapter(env);

    case "anthropic":
      return createAnthropicAdapter(env);

    default:
      console.warn(
        `[ai/adapter-factory] Unknown provider "${provider}", falling back to LiteLLM`,
      );
      return createLiteLLMAdapter(env);
  }
}

/**
 * Create LiteLLM adapter with proper configuration.
 * @param env - Cloudflare environment
 * @param overrideApiKey - Optional override key for BYOK
 * @throws ProviderError if required env vars are missing
 */
export function createLiteLLMAdapter(
  env: Env,
  overrideApiKey?: string,
): LiteLLMAdapter {
  const { apiKey, baseURL } = resolveLiteLLMKey(env, overrideApiKey);

  const defaultModel = env.DEFAULT_MODEL;
  if (!defaultModel) {
    throw new ProviderError(
      "litellm",
      "DEFAULT_MODEL is required for LiteLLM provider",
    );
  }

  return new LiteLLMAdapter({
    apiKey,
    baseURL,
    defaultModel,
  });
}

/**
 * Create OpenAI adapter with proper configuration.
 * @param env - Cloudflare environment
 * @param overrideApiKey - Optional override key for BYOK
 * @throws ProviderError if required env vars are missing
 */
export function createOpenAIAdapter(
  env: Env,
  overrideApiKey?: string,
): OpenAIAdapter {
  const { apiKey } = resolveOpenAIKey(env, overrideApiKey);

  return new OpenAIAdapter({
    apiKey,
    defaultModel: env.DEFAULT_MODEL,
  });
}

/**
 * Create Anthropic adapter with proper configuration.
 * @param env - Cloudflare environment
 * @param overrideApiKey - Optional override key for BYOK
 * @throws ProviderError if required env vars are missing
 */
export function createAnthropicAdapter(
  env: Env,
  overrideApiKey?: string,
): AnthropicAdapter {
  const apiKey = resolveAnthropicKey(env, overrideApiKey);

  return new AnthropicAdapter({
    apiKey,
    defaultModel: env.DEFAULT_MODEL,
  });
}

/**
 * Create OpenRouter adapter with direct endpoint.
 * Uses user's BYOK for direct inference.
 * @param overrideApiKey - The API key from ProviderConfigService
 * @throws ProviderError if key is missing or invalid format
 */
export function createOpenRouterAdapter(overrideApiKey?: string): OpenAIAdapter {
  const { apiKey, baseURL } = resolveOpenRouterKey(overrideApiKey);

  return new OpenAIAdapter({
    apiKey,
    baseURL,
    defaultModel: undefined, // OpenRouter handles model in request
  });
}

/**
 * Create Groq adapter with direct endpoint.
 * Uses user's BYOK for direct inference.
 * @param overrideApiKey - The API key from ProviderConfigService
 * @throws ProviderError if key is missing or invalid format
 */
export function createGroqAdapter(overrideApiKey?: string): OpenAIAdapter {
  const { apiKey, baseURL } = resolveGroqKey(overrideApiKey);

  return new OpenAIAdapter({
    apiKey,
    baseURL,
    defaultModel: undefined, // Groq handles model in request
  });
}
