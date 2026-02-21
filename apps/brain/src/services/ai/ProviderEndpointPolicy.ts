/**
 * ProviderEndpointPolicy - Endpoint configuration for direct BYOK providers
 *
 * Single Responsibility: Encapsulate provider endpoint URLs and key format validation.
 * Centralized configuration for OpenRouter, Groq, and other direct providers.
 */

import type { ProviderId } from "@repo/shared-types";

/**
 * Provider endpoint configuration for direct inference
 */
export interface ProviderEndpointConfig {
  baseURL: string;
  apiKeyPrefix: string;
  requiresApiKey: boolean;
}

/**
 * Direct provider endpoint configurations for BYOK runtime
 * Only includes providers with direct endpoints (not OpenAI or Anthropic).
 */
export const PROVIDER_ENDPOINTS: Record<
  "openrouter" | "groq",
  ProviderEndpointConfig
> = {
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyPrefix: "sk-or-",
    requiresApiKey: true,
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    apiKeyPrefix: "gsk_",
    requiresApiKey: true,
  },
};

/**
 * Validate API key format against provider requirements.
 * @param providerId - The provider ID
 * @param apiKey - The API key to validate
 * @throws Error if key format is invalid
 */
export function validateProviderApiKeyFormat(
  providerId: ProviderId,
  apiKey: string,
): void {
  if (providerId === "openrouter" || providerId === "groq") {
    const config = PROVIDER_ENDPOINTS[providerId];
    if (!apiKey.startsWith(config.apiKeyPrefix)) {
      throw new Error(
        `Invalid ${providerId} API key format. Key must start with "${config.apiKeyPrefix}"`,
      );
    }
  }
}

/**
 * Get the base URL for a provider.
 * @param providerId - The provider ID
 * @returns The base URL, or undefined if not a direct provider
 */
export function getProviderBaseURL(providerId: ProviderId): string | undefined {
  if (providerId === "openrouter" || providerId === "groq") {
    return PROVIDER_ENDPOINTS[providerId].baseURL;
  }
  return undefined;
}
