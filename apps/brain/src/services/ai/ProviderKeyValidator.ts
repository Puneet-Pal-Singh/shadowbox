/**
 * ProviderKeyValidator - API key validation for all providers
 *
 * Single Responsibility: Validate and retrieve API keys from environment or provider config.
 * Centralized logic for key format and existence validation.
 */

import type { Env } from "../../types/ai";
import { ProviderError } from "../providers";
import { validateProviderApiKeyFormat } from "./ProviderEndpointPolicy";
import type { ProviderId } from "@repo/shared-types";
import type { RuntimeProvider } from "./ModelSelectionPolicy";
import {
  GROQ_BASE_URL,
  OPENAI_BASE_URL,
  OPENROUTER_BASE_URL,
} from "./defaults";

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
    baseURL: OPENAI_BASE_URL,
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
    baseURL: OPENROUTER_BASE_URL,
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
    baseURL: GROQ_BASE_URL,
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
  const apiKeySource = resolveLiteLLMKeySource(env, overrideApiKey);
  const apiKey = apiKeySource.apiKey;
  if (!apiKey) {
    throw new ProviderError(
      "litellm",
      "Missing GROQ_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY",
    );
  }

  const baseURL = resolveLiteLLMBaseURL(env, apiKeySource.source);
  return { apiKey, baseURL };
}

type LiteLLMKeySource = "override" | "groq" | "openrouter" | "openai";

function resolveLiteLLMKeySource(
  env: Env,
  overrideApiKey?: string,
): { apiKey?: string; source: LiteLLMKeySource } {
  if (overrideApiKey) {
    return { apiKey: overrideApiKey, source: "override" };
  }
  if (env.GROQ_API_KEY) {
    return { apiKey: env.GROQ_API_KEY, source: "groq" };
  }
  if (env.OPENROUTER_API_KEY) {
    return { apiKey: env.OPENROUTER_API_KEY, source: "openrouter" };
  }
  if (env.OPENAI_API_KEY) {
    return { apiKey: env.OPENAI_API_KEY, source: "openai" };
  }
  return { source: "override" };
}

function resolveLiteLLMBaseURL(env: Env, source: LiteLLMKeySource): string {
  if (env.LITELLM_BASE_URL) {
    return env.LITELLM_BASE_URL;
  }

  switch (source) {
    case "openrouter":
      return OPENROUTER_BASE_URL;
    case "openai":
      return OPENAI_BASE_URL;
    case "override":
    case "groq":
    default:
      return GROQ_BASE_URL;
  }
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
