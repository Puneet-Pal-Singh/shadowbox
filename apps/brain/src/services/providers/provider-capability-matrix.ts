/**
 * Provider capability matrix.
 *
 * Single Responsibility: expose provider/model capability lookups used by
 * runtime model selection policy.
 */

import type { ProviderId } from "../../schemas/provider";
import { PROVIDER_IDS } from "../../schemas/provider-registry";
import { PROVIDER_CATALOG } from "./catalog";

interface ProviderCapabilities {
  allowedModelIds: ReadonlySet<string>;
}

function buildCapabilityMatrix(): Record<ProviderId, ProviderCapabilities> {
  const matrix = {} as Record<ProviderId, ProviderCapabilities>;
  for (const providerId of PROVIDER_IDS as readonly ProviderId[]) {
    const models = PROVIDER_CATALOG[providerId] ?? [];
    matrix[providerId] = {
      allowedModelIds: new Set(models.map((model) => model.id)),
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
