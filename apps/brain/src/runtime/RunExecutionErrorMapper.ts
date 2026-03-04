import { DomainError, isDomainError } from "../domain/errors";

const RUN_MANIFEST_IMMUTABLE_CODE = "RUN_MANIFEST_IMMUTABLE";
const RUN_MANIFEST_IMMUTABLE_STATUS = 409;
const RUN_MANIFEST_MISMATCH_SENTINEL = "Immutable run manifest mismatch";
const RUN_MANIFEST_IMMUTABLE_MESSAGE =
  "Run selection is immutable for an existing runId. Create a new runId to change provider, model, harness, or orchestrator backend.";

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
