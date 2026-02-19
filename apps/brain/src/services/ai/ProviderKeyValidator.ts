/**
 * ProviderKeyValidator - API key validation for all providers
 *
 * Single Responsibility: Validate and retrieve API keys from environment or provider config.
 * Centralized logic for key format and existence validation.
 */

import type { Env } from "../../types/ai";
import { ProviderError } from "../providers";
import { validateProviderApiKeyFormat } from "./ProviderEndpointPolicy";
import type { ProviderId } from "../../schemas/provider";
import type { RuntimeProvider } from "./ModelSelectionPolicy";

/**
 * Validate and retrieve OpenAI API key.
 * @param env - Cloudflare environment
 * @param overrideApiKey - Optional override key (for BYOK)
 * @throws ProviderError if key is missing
 */
export function resolveOpenAIKey(
  env: Env,
  overrideApiKey?: string,
): { apiKey: string; baseURL: string } {
  const apiKey = overrideApiKey ?? env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ProviderError("openai", "Missing OPENAI_API_KEY");
  }
  return {
    apiKey,
    baseURL: "https://api.openai.com/v1",
  };
}

/**
 * Validate and retrieve Anthropic API key.
 * @param env - Cloudflare environment
 * @param overrideApiKey - Optional override key (for BYOK)
 * @throws ProviderError if key is missing
 */
export function resolveAnthropicKey(
  env: Env,
  overrideApiKey?: string,
): string {
  const apiKey = overrideApiKey ?? env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ProviderError("anthropic", "Missing ANTHROPIC_API_KEY");
  }
  return apiKey;
}

/**
 * Validate and retrieve OpenRouter API key.
 * @param overrideApiKey - The API key (should come from ProviderConfigService)
 * @throws ProviderError if key is missing or has invalid format
 */
export function resolveOpenRouterKey(overrideApiKey?: string): {
  apiKey: string;
  baseURL: string;
} {
  if (!overrideApiKey) {
    throw new ProviderError(
      "openrouter",
      "OpenRouter provider is not connected. Please connect your OpenRouter API key in settings.",
    );
  }

  // Validate key format
  validateProviderApiKeyFormat("openrouter", overrideApiKey);

  return {
    apiKey: overrideApiKey,
    baseURL: "https://openrouter.ai/api/v1",
  };
}

/**
 * Validate and retrieve Groq API key.
 * @param overrideApiKey - The API key (should come from ProviderConfigService)
 * @throws ProviderError if key is missing or has invalid format
 */
export function resolveGroqKey(overrideApiKey?: string): {
  apiKey: string;
  baseURL: string;
} {
  if (!overrideApiKey) {
    throw new ProviderError(
      "groq",
      "Groq provider is not connected. Please connect your Groq API key in settings.",
    );
  }

  // Validate key format
  validateProviderApiKeyFormat("groq", overrideApiKey);

  return {
    apiKey: overrideApiKey,
    baseURL: "https://api.groq.com/openai/v1",
  };
}

/**
 * Validate and retrieve LiteLLM API key.
 * Falls back through GROQ_API_KEY, then OPENAI_API_KEY.
 * @param env - Cloudflare environment
 * @param overrideApiKey - Optional override key (for BYOK)
 * @throws ProviderError if key is missing
 */
export function resolveLiteLLMKey(
  env: Env,
  overrideApiKey?: string,
): { apiKey: string; baseURL: string } {
  const apiKey =
    overrideApiKey ?? env.GROQ_API_KEY ?? env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ProviderError(
      "litellm",
      "Missing GROQ_API_KEY or OPENAI_API_KEY",
    );
  }

  const baseURL = env.LITELLM_BASE_URL ?? "https://api.groq.com/openai/v1";
  return { apiKey, baseURL };
}

/**
 * Resolve API key for a specific provider when using SDK model generation.
 * @param provider - The runtime provider type
 * @param env - Cloudflare environment
 * @param overrideApiKey - Optional override key
 * @returns { apiKey, baseURL }
 * @throws ProviderError if key is missing or invalid
 */
export function resolveProviderKey(
  provider: RuntimeProvider,
  env: Env,
  overrideApiKey?: string,
): { apiKey: string; baseURL: string } {
  switch (provider) {
    case "openai":
      return resolveOpenAIKey(env, overrideApiKey);
    case "openrouter":
      return resolveOpenRouterKey(overrideApiKey);
    case "groq":
      return resolveGroqKey(overrideApiKey);
    case "anthropic":
      return { apiKey: resolveAnthropicKey(env, overrideApiKey), baseURL: "https://api.anthropic.com" };
    case "litellm":
    default:
      return resolveLiteLLMKey(env, overrideApiKey);
  }
}
