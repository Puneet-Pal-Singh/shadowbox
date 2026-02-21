/**
 * Provider capability matrix.
 *
 * Single Responsibility: expose provider/model capability lookups used by
 * runtime model selection policy.
 */

import type { ProviderCapabilityFlags } from "@repo/shared-types";
import type { ProviderId } from "@repo/shared-types";
import { PROVIDER_IDS } from "../../schemas/provider-registry";
import { PROVIDER_CATALOG } from "./catalog";

interface ProviderCapabilities {
  allowedModelIds: ReadonlySet<string>;
  flags: ProviderCapabilityFlags;
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
};

function buildCapabilityMatrix(): Record<ProviderId, ProviderCapabilities> {
  const matrix = {} as Record<ProviderId, ProviderCapabilities>;
  for (const providerId of PROVIDER_IDS as readonly ProviderId[]) {
    const models = PROVIDER_CATALOG[providerId] ?? [];
    matrix[providerId] = {
      allowedModelIds: new Set(models.map((model) => model.id)),
      flags: PROVIDER_CAPABILITY_FLAGS[providerId],
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
  return PROVIDER_CAPABILITY_MATRIX[providerId]?.flags ?? {
    streaming: false,
    tools: false,
    structuredOutputs: false,
    jsonMode: false,
  };
}
