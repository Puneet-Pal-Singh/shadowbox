import type { RunInput, RunManifest } from "../types.js";

export function createRunManifest(input: RunInput): RunManifest {
  return {
    mode: "agentic",
    providerId: normalizeOptionalSelection(input.providerId),
    modelId: normalizeOptionalSelection(input.modelId),
    harness: "cloudflare-sandbox",
    orchestratorBackend: "execution-engine-v1",
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

export class RunManifestMismatchError extends Error {
  constructor(existing: RunManifest, candidate: RunManifest) {
    super(
      `[run/manifest] Immutable run manifest mismatch. existing=${JSON.stringify(
        existing,
      )} candidate=${JSON.stringify(candidate)}`,
    );
    this.name = "RunManifestMismatchError";
  }
}
