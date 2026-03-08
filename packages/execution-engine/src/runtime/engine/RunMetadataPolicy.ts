import type { CanonicalRunLifecycleStep, RunManifest } from "../types.js";
import type { Run } from "../run/index.js";

export function recordPhaseSelectionSnapshot(
  run: Run,
  phase: "planning" | "execution" | "synthesis",
): void {
  const manifest = run.metadata.manifest;
  if (!manifest) {
    throw new Error(
      `[run/engine] Missing run manifest before recording ${phase} phase snapshot`,
    );
  }

  const existingSnapshots = run.metadata.phaseSelectionSnapshots ?? {};
  run.metadata.phaseSelectionSnapshots = {
    ...existingSnapshots,
    [phase]: cloneManifest(manifest),
  };
}

export function isPlatformApprovalOwner(manifest?: RunManifest): boolean {
  return manifest?.harnessMode !== "delegated";
}

export function recordLifecycleStep(
  run: Run,
  step: CanonicalRunLifecycleStep,
  detail?: string,
): void {
  const existingSteps = run.metadata.lifecycleSteps ?? [];
  run.metadata.lifecycleSteps = [
    ...existingSteps,
    {
      step,
      recordedAt: new Date().toISOString(),
      detail,
    },
  ];
}

function cloneManifest(manifest: RunManifest): RunManifest {
  return {
    mode: manifest.mode,
    providerId: manifest.providerId,
    modelId: manifest.modelId,
    harness: manifest.harness,
    orchestratorBackend: manifest.orchestratorBackend,
    executionBackend: manifest.executionBackend,
    harnessMode: manifest.harnessMode,
    authMode: manifest.authMode,
  };
}
