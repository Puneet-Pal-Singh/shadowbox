import type { OrchestratorBackend } from "@shadowbox/orchestrator-core";
import { RunManifestMismatchError } from "@shadowbox/orchestrator-core";
import type { RunInput, RunManifest, RuntimeHarnessId } from "../types.js";

export { RunManifestMismatchError } from "@shadowbox/orchestrator-core";

/**
 * Creates a run manifest with deterministic configuration.
 * 
 * Backend selection follows explicit precedence:
 * 1. If runtime context specifies cloudflare_agents, use cloudflare_agents
 * 2. Otherwise default to execution-engine-v1 (current standard)
 * 
 * This ensures portable, explicit backend selection without implicit fallbacks.
 */
export function createRunManifest(
  input: RunInput,
  options?: { preferredBackend?: OrchestratorBackend },
): RunManifest {
  const orchestratorBackend = options?.preferredBackend ?? "execution-engine-v1";
  
  return {
    mode: "agentic",
    providerId: normalizeOptionalSelection(input.providerId),
    modelId: normalizeOptionalSelection(input.modelId),
    harness: normalizeHarnessSelection(input.harnessId),
    orchestratorBackend,
  };
}

export function ensureManifestMatch(
  existing: RunManifest | undefined,
  candidate: RunManifest,
): void {
  if (!existing) {
    return;
  }
  if (
    existing.mode !== candidate.mode ||
    existing.providerId !== candidate.providerId ||
    existing.modelId !== candidate.modelId ||
    existing.harness !== candidate.harness ||
    existing.orchestratorBackend !== candidate.orchestratorBackend
  ) {
    throw new RunManifestMismatchError(existing, candidate);
  }
}

function normalizeOptionalSelection(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function normalizeHarnessSelection(
  harnessId?: RuntimeHarnessId,
): RuntimeHarnessId {
  return harnessId ?? "cloudflare-sandbox";
}
