/**
 * Provider capability matrix.
 *
 * Single Responsibility: expose provider/model capability lookups used by
 * runtime model selection policy.
 */

import type { ProviderCapabilityFlags } from "@repo/shared-types";
import type { ProviderId } from "@repo/shared-types";
import { PROVIDER_IDS } from "../../schemas/provider-registry";
import { ValidationError } from "../../domain/errors";
import { PROVIDER_CATALOG } from "./catalog";

interface ProviderCapabilities {
  allowedModelIds: ReadonlySet<string>;
  flags: ProviderCapabilityFlags;
}

class ProviderCapabilityConfigurationError extends ValidationError {
  constructor(providerId: ProviderId) {
    super(
      `Missing provider capability flags for provider "${providerId}".`,
      "INVALID_PROVIDER_SELECTION",
    );
    this.name = "ProviderCapabilityConfigurationError";
  }
}

const PROVIDER_CAPABILITY_FLAGS: Record<ProviderId, ProviderCapabilityFlags> = {
  openrouter: {
    streaming: true,
    tools: true,
    structuredOutputs: true,
    jsonMode: true,
  },
  openai: {
    streaming: true,
    tools: true,
    structuredOutputs: true,
    jsonMode: true,
  },
  groq: {
    streaming: true,
    tools: true,
    structuredOutputs: true,
    jsonMode: true,
  },
  google: {
    streaming: true,
    tools: true,
    structuredOutputs: true,
    jsonMode: false,
  },
};

function resolveProviderCapabilityFlags(
  providerId: ProviderId,
): ProviderCapabilityFlags {
  const flags = PROVIDER_CAPABILITY_FLAGS[providerId];
  if (!flags) {
    throw new ProviderCapabilityConfigurationError(providerId);
  }
  return flags;
}

function buildCapabilityMatrix(): Record<ProviderId, ProviderCapabilities> {
  const matrix = {} as Record<ProviderId, ProviderCapabilities>;
  for (const providerId of PROVIDER_IDS as readonly ProviderId[]) {
    const models = PROVIDER_CATALOG[providerId] ?? [];
    matrix[providerId] = {
      allowedModelIds: new Set(models.map((model) => model.id)),
      flags: resolveProviderCapabilityFlags(providerId),
    };
  }

  return matrix;
}

export const PROVIDER_CAPABILITY_MATRIX = buildCapabilityMatrix();

export function isModelAllowedByCapabilityMatrix(
  providerId: ProviderId,
  modelId: string,
): boolean {
  return (
    PROVIDER_CAPABILITY_MATRIX[providerId]?.allowedModelIds.has(modelId) ??
    false
  );
}

export function getProviderCapabilityFlags(
  providerId: ProviderId,
): ProviderCapabilityFlags {
  const entry = PROVIDER_CAPABILITY_MATRIX[providerId];
  if (!entry) {
    throw new ProviderCapabilityConfigurationError(providerId);
  }
  return entry.flags;
}
