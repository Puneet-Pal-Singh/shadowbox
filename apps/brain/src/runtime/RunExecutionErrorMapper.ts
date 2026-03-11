import { DomainError, isDomainError } from "../domain/errors";

const RUN_MANIFEST_IMMUTABLE_CODE = "RUN_MANIFEST_IMMUTABLE";
const RUN_MANIFEST_IMMUTABLE_STATUS = 409;
const RUN_MANIFEST_MISMATCH_SENTINEL = "Immutable run manifest mismatch";
const RUN_MANIFEST_IMMUTABLE_MESSAGE =
  "Run selection is immutable while a run is active. Wait for completion (or cancel the active run), then change provider/model/harness/orchestrator.";
const PLAN_SCHEMA_MISMATCH_CODE = "PLAN_SCHEMA_MISMATCH";
const PLAN_SCHEMA_MISMATCH_STATUS = 422;
const PLAN_SCHEMA_MISMATCH_MESSAGE =
  "The model could not produce a valid structured execution plan for this request. Retry with a more concrete path/command, or use a model that supports structured planning reliably.";
const PLAN_GENERATION_TIMEOUT_CODE = "PLAN_GENERATION_TIMEOUT";
const PLAN_GENERATION_TIMEOUT_STATUS = 504;
const PLAN_GENERATION_TIMEOUT_MESSAGE =
  "Planning timed out before executable tasks could be generated. Retry with a narrower request.";
const PLAN_SCHEMA_MISMATCH_SENTINEL =
  "No object generated: response did not match schema";
const PLANNER_SCHEMA_MISMATCH_SENTINEL =
  "Planner response did not match required schema";
const PLAN_TIMEOUT_SENTINEL = "Planner request timed out";

/**
 * Maps runtime execution failures to typed domain errors when possible.
 */
export function mapRunExecutionErrorToDomain(
  error: unknown,
  correlationId?: string,
): DomainError | null {
  if (isDomainError(error)) {
    return error;
  }

  if (isRunManifestMismatch(error)) {
    return new DomainError(
      RUN_MANIFEST_IMMUTABLE_CODE,
      RUN_MANIFEST_IMMUTABLE_MESSAGE,
      RUN_MANIFEST_IMMUTABLE_STATUS,
      false,
      correlationId,
    );
  }

  if (isPlanSchemaMismatch(error)) {
    return new DomainError(
      PLAN_SCHEMA_MISMATCH_CODE,
      PLAN_SCHEMA_MISMATCH_MESSAGE,
      PLAN_SCHEMA_MISMATCH_STATUS,
      false,
      correlationId,
    );
  }

  if (isPlanGenerationTimeout(error)) {
    return new DomainError(
      PLAN_GENERATION_TIMEOUT_CODE,
      PLAN_GENERATION_TIMEOUT_MESSAGE,
      PLAN_GENERATION_TIMEOUT_STATUS,
      true,
      correlationId,
    );
  }

  return null;
}

function isRunManifestMismatch(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "RunManifestMismatchError" &&
    error.message.includes(RUN_MANIFEST_MISMATCH_SENTINEL)
  );
}

function isPlanSchemaMismatch(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes(PLAN_SCHEMA_MISMATCH_SENTINEL) ||
    error.message.includes(PLANNER_SCHEMA_MISMATCH_SENTINEL)
  );
}

function isPlanGenerationTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    (error.name === "LLMTimeoutError" &&
      error.message.includes("(phase=planning)")) ||
    error.message.includes(PLAN_TIMEOUT_SENTINEL)
  );
}
