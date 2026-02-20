/**
 * Canonical provider registry for provider schema and runtime lookup.
 *
 * Single Responsibility: define supported provider IDs and metadata used by
 * both schema validation and provider services.
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
