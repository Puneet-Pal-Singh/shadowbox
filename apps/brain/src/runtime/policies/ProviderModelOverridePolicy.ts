/**
 * ProviderModelOverridePolicy - Validate provider/model override constraints.
 *
 * Single Responsibility: Enforce that provider and model overrides must be paired.
 * Either both are set or both are omitted. No partial overrides allowed.
 */

import { ValidationError } from "../../domain/errors";
import type { ExecuteRunPayload } from "../parsing/ExecuteRunPayloadSchema";

/**
 * Enforce provider/model override pairing constraint.
 *
 * Rule: If providerId is specified, modelId must also be specified, and vice versa.
 *       Partial overrides (only one specified) are not allowed.
 *
 * @param payload - The execute run payload
 * @throws ValidationError if pairing constraint violated
 */
export function validateProviderModelOverride(
  payload: ExecuteRunPayload,
): void {
  const { providerId, modelId } = payload.input;
  const hasProviderId = providerId !== undefined && providerId !== null;
  const hasModelId = modelId !== undefined && modelId !== null;

  if (hasProviderId !== hasModelId) {
    throw new ValidationError(
      "Provider and model overrides must both be set or both be omitted",
      "INVALID_PROVIDER_MODEL_PAIR",
      payload.correlationId,
    );
  }
}
