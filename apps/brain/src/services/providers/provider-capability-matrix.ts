/**
 * Provider capability lookup backed by provider registry authority.
 *
 * This module intentionally avoids static in-repo model allowlists.
 */

import type { ProviderCapabilityFlags } from "@repo/shared-types";
import { ProviderRegistryService } from "./ProviderRegistryService";

interface ProviderCapabilities {
  allowedModelIds: ReadonlySet<string>;
  flags: ProviderCapabilityFlags;
}

const registryService = new ProviderRegistryService();

function buildCapabilityMatrix(): Record<string, ProviderCapabilities> {
  const matrix: Record<string, ProviderCapabilities> = {};
  for (const provider of registryService.listProviders()) {
    matrix[provider.providerId] = {
      // Default model is a seed only; dynamic discovery remains model authority.
      allowedModelIds: provider.defaultModelId
        ? new Set([provider.defaultModelId])
        : new Set(),
      flags: provider.capabilities,
    };
  }
  return matrix;
}

export const PROVIDER_CAPABILITY_MATRIX = buildCapabilityMatrix();

export function isModelAllowedByCapabilityMatrix(
  providerId: string,
  modelId: string,
): boolean {
  const providerEntry = registryService.getProvider(providerId);
  if (!providerEntry) {
    return false;
  }
  if (!modelId || modelId.trim().length === 0) {
    return false;
  }
  const seededModels = PROVIDER_CAPABILITY_MATRIX[providerId]?.allowedModelIds;
  if (!seededModels || seededModels.size === 0) {
    return true;
  }
  return seededModels.has(modelId) || providerEntry.defaultModelId === modelId;
}

export function getProviderCapabilityFlags(
  providerId: string,
): ProviderCapabilityFlags {
  return (
    registryService.getProviderCapabilities(providerId) ?? {
      streaming: false,
      tools: false,
      structuredOutputs: false,
      jsonMode: false,
    }
  );
}
