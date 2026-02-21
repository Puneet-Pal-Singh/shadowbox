/**
 * Canonical provider registry for provider schema and runtime lookup.
 *
 * Single Responsibility: define supported provider IDs and metadata used by
 * both schema validation and provider services.
 */

import { PROVIDER_IDS, type ProviderId } from "@repo/shared-types";

interface ProviderRegistryEntry {
  apiKeyPrefixes: readonly string[];
}

export const PROVIDER_REGISTRY: Record<ProviderId, ProviderRegistryEntry> =
  {
    openrouter: { apiKeyPrefixes: ["sk-or-"] },
    openai: { apiKeyPrefixes: ["sk-"] },
    groq: { apiKeyPrefixes: ["gsk_"] },
  };

export function isProviderApiKeyFormatValid(
  providerId: ProviderId,
  apiKey: string,
): boolean {
  const prefixes = PROVIDER_REGISTRY[providerId].apiKeyPrefixes;
  return prefixes.some((prefix) => apiKey.startsWith(prefix));
}

export { PROVIDER_IDS };
