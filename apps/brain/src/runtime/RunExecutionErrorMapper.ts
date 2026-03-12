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
const PROVIDER_UNAVAILABLE_CODE = "PROVIDER_UNAVAILABLE";
const PROVIDER_UNAVAILABLE_STATUS = 503;
const PROVIDER_UNAVAILABLE_MESSAGE =
  "Provider request failed after retries. Verify provider/model availability, then retry.";
const PROVIDER_RATE_LIMITED_CODE = "RATE_LIMITED";
const PROVIDER_RATE_LIMITED_STATUS = 429;
const PROVIDER_RATE_LIMITED_MESSAGE =
  "Provider rate limit reached. Retry after a short cooldown or switch providers.";
const PROVIDER_AUTH_FAILED_CODE = "AUTH_FAILED";
const PROVIDER_AUTH_FAILED_STATUS = 401;
const PROVIDER_AUTH_FAILED_MESSAGE =
  "Provider authentication failed. Reconnect credentials in Provider Settings and retry.";

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

  if (isProviderRateLimited(error)) {
    return new DomainError(
      PROVIDER_RATE_LIMITED_CODE,
      PROVIDER_RATE_LIMITED_MESSAGE,
      PROVIDER_RATE_LIMITED_STATUS,
      true,
      correlationId,
    );
  }

  if (isProviderAuthFailure(error)) {
    return new DomainError(
      PROVIDER_AUTH_FAILED_CODE,
      PROVIDER_AUTH_FAILED_MESSAGE,
      PROVIDER_AUTH_FAILED_STATUS,
      false,
      correlationId,
    );
  }

  if (isProviderUnavailable(error)) {
    return new DomainError(
      PROVIDER_UNAVAILABLE_CODE,
      PROVIDER_UNAVAILABLE_MESSAGE,
      PROVIDER_UNAVAILABLE_STATUS,
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
  const signalText = getErrorSignalText(error);
  return (
    (error.name === "LLMTimeoutError" && signalText.includes("(phase=planning)")) ||
    signalText.includes(PLAN_TIMEOUT_SENTINEL.toLowerCase())
  );
}

function isProviderUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const signalText = getErrorSignalText(error);

  return (
    signalText.includes("failed after 3 attempts") ||
    signalText.includes("provider returned error") ||
    signalText.includes("provider request failed") ||
    signalText.includes("service unavailable") ||
    signalText.includes("econnreset") ||
    signalText.includes("upstream")
  );
}

function isProviderRateLimited(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const signalText = getErrorSignalText(error);
  return (
    signalText.includes("rate limit") ||
    signalText.includes("too many requests") ||
    signalText.includes("status code 429") ||
    signalText.includes(" 429 ")
  );
}

function isProviderAuthFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const signalText = getErrorSignalText(error);
  return (
    signalText.includes("unauthorized") ||
    signalText.includes("authentication failed") ||
    signalText.includes("invalid api key") ||
    signalText.includes("incorrect api key") ||
    signalText.includes("status code 401") ||
    signalText.includes(" 401 ")
  );
}

function getErrorSignalText(error: Error): string {
  const segments: string[] = [];
  let current: unknown = error;
  let depth = 0;

  while (current && depth < 6) {
    if (current instanceof Error) {
      segments.push(current.message ?? "");
      current = (current as { cause?: unknown }).cause;
      depth += 1;
      continue;
    }
    if (typeof current === "string") {
      segments.push(current);
      break;
    }
    if (typeof current === "object" && current !== null) {
      try {
        segments.push(JSON.stringify(current));
      } catch {
        segments.push(String(current));
      }
      break;
    }
    segments.push(String(current));
    break;
  }

  return segments.join(" | ").toLowerCase();
}
