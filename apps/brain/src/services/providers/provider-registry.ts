/**
 * Canonical provider registry for Brain BYOK/provider flows.
 *
 * Single Responsibility: Define supported provider IDs and provider metadata
 * used by schemas and services to avoid enum/switch drift.
 */

export const PROVIDER_IDS = ["openrouter", "openai", "groq"] as const;
export type RegisteredProviderId = (typeof PROVIDER_IDS)[number];

interface ProviderRegistryEntry {
  apiKeyPrefixes: readonly string[];
}

export const PROVIDER_REGISTRY: Record<RegisteredProviderId, ProviderRegistryEntry> =
  {
    openrouter: { apiKeyPrefixes: ["sk-or-"] },
    openai: { apiKeyPrefixes: ["sk-"] },
    groq: { apiKeyPrefixes: ["gsk_"] },
  };

export function isProviderApiKeyFormatValid(
  providerId: RegisteredProviderId,
  apiKey: string,
): boolean {
  const prefixes = PROVIDER_REGISTRY[providerId].apiKeyPrefixes;
  return prefixes.some((prefix) => apiKey.startsWith(prefix));
}
