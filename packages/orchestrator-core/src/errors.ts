/**
 * Typed orchestration errors.
 *
 * Canonical error contracts for orchestration failures.
 * All orchestrator adapters use these for consistent error semantics.
 *
 * Canonical alignment: Plan 64 CFA1
 */

import type { OrchestratorBackend } from "./workflow.js";

export const ORCHESTRATION_ERROR_CODES = {
  INVALID_RUN_TRANSITION: "INVALID_RUN_TRANSITION",
  RUN_MANIFEST_MISMATCH: "RUN_MANIFEST_MISMATCH",
  ORCHESTRATOR_UNAVAILABLE: "ORCHESTRATOR_UNAVAILABLE",
  RUN_NOT_FOUND: "RUN_NOT_FOUND",
} as const;

export type OrchestrationErrorCode =
  (typeof ORCHESTRATION_ERROR_CODES)[keyof typeof ORCHESTRATION_ERROR_CODES];

/**
 * Base orchestration error.
 * All orchestration-specific errors extend this class.
 */
export class OrchestrationError extends Error {
  constructor(
    message: string,
    readonly code: OrchestrationErrorCode,
  ) {
    super(message);
    this.name = "OrchestrationError";
  }
}

/**
 * Thrown when an invalid run state transition is attempted.
 */
export class StateMachineError extends OrchestrationError {
  constructor(message: string) {
    super(`[run/state-machine] ${message}`, "INVALID_RUN_TRANSITION");
    this.name = "StateMachineError";
  }
}

/**
 * Narrow manifest shape for mismatch comparison.
 * Avoids coupling to full RunManifest which lives in execution-engine.
 */
export interface RunManifestLike {
  mode: string;
  providerId: string | null;
  modelId: string | null;
  harness: string;
  orchestratorBackend: OrchestratorBackend;
}

/**
 * Thrown when a run manifest mismatch is detected during execution.
 */
export class RunManifestMismatchError extends OrchestrationError {
  constructor(existing: RunManifestLike, candidate: RunManifestLike) {
    super(
      `[run/manifest] Immutable run manifest mismatch. existing=${JSON.stringify(existing)} candidate=${JSON.stringify(candidate)}`,
      "RUN_MANIFEST_MISMATCH",
    );
    this.name = "RunManifestMismatchError";
  }
}
