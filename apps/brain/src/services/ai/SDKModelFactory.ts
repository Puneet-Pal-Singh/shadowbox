/**
 * SDKModelFactory - Create Vercel AI SDK model instances
 *
 * Single Responsibility: Build language model instances from Vercel AI SDK
 * for structured generation (generateObject). Centralizes SDK initialization.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { Env } from "../../types/ai";
import { ProviderError } from "../providers";
import { resolveProviderKey } from "./ProviderKeyValidator";
import type { RuntimeProvider } from "./ModelSelectionPolicy";

/**
 * Get the appropriate AI SDK model instance for structured generation.
 * Uses the configured provider from env or override API key.
 *
 * @param model - The model name to instantiate
 * @param provider - The runtime provider type
 * @param env - Cloudflare environment
 * @param overrideApiKey - Optional override API key for BYOK
 * @returns Vercel AI SDK model instance
 * @throws ProviderError if provider is not supported or keys are missing
 */
export function createSDKModel(
  model: string,
  provider: RuntimeProvider,
  env: Env,
  overrideApiKey?: string,
) {
  switch (provider) {
    case "anthropic":
      return createAnthropicSDKModel(model, env, overrideApiKey);

    case "openai":
      return createOpenAICompatibleSDKModel(
        model,
        "openai",
        env,
        overrideApiKey,
      );

    case "openrouter":
      return createOpenAICompatibleSDKModel(
        model,
        "openrouter",
        env,
        overrideApiKey,
      );

    case "groq":
      return createOpenAICompatibleSDKModel(
        model,
        "groq",
        env,
        overrideApiKey,
      );

    case "litellm":
    default:
      return createOpenAICompatibleSDKModel(
        model,
        "litellm",
        env,
        overrideApiKey,
      );
  }
}

/**
 * Create Anthropic model instance.
 * @param model - The model name (e.g., "claude-3-opus")
 * @param env - Cloudflare environment
 * @param overrideApiKey - Optional override API key
 * @throws ProviderError if API key is missing
 */
function createAnthropicSDKModel(
  model: string,
  env: Env,
  overrideApiKey?: string,
) {
  const apiKey = resolveAnthropicSDKKey(env, overrideApiKey);
  const client = createAnthropic({ apiKey });
  return client(model);
}

/**
 * Create OpenAI-compatible model instance (OpenAI, OpenRouter, Groq, LiteLLM).
 * @param model - The model name
 * @param provider - The provider name (openai, openrouter, groq, litellm)
 * @param env - Cloudflare environment
 * @param overrideApiKey - Optional override API key
 * @throws ProviderError if API key is missing
 */
function createOpenAICompatibleSDKModel(
  model: string,
  provider: string,
  env: Env,
  overrideApiKey?: string,
) {
  const { apiKey, baseURL } = resolveProviderKey(
    provider,
    env,
    overrideApiKey,
  );

  const client = createOpenAI({
    baseURL,
    apiKey,
  });

  return client(model);
}

/**
 * Resolve Anthropic API key for SDK use.
 * @param env - Cloudflare environment
 * @param overrideApiKey - Optional override key
 * @throws ProviderError if key is missing
 */
function resolveAnthropicSDKKey(
  env: Env,
  overrideApiKey?: string,
): string {
  const apiKey = overrideApiKey ?? env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ProviderError("anthropic", "Missing ANTHROPIC_API_KEY");
  }
  return apiKey;
}
