/**
 * BYOK Error Taxonomy
 *
 * Normalized error codes and messages for provider/credential operations.
 * Ensures UI-safe error reporting without leaking secrets or implementation details.
 */

import { z } from "zod";

/**
 * BYOK Error Codes - Comprehensive, observable, UI-friendly
 */
export const BYOKErrorCodeSchema = z.enum([
  // Credential-level errors
  "CREDENTIAL_NOT_FOUND",
  "CREDENTIAL_INVALID_FORMAT",
  "CREDENTIAL_VALIDATION_FAILED",
  "CREDENTIAL_ALREADY_EXISTS",
  "CREDENTIAL_REVOKED",
  "CREDENTIAL_EXPIRED",

  // Provider-level errors
  "PROVIDER_NOT_FOUND",
  "PROVIDER_NOT_CONNECTED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_AUTH_FAILED",
  "MODEL_DISCOVERY_AUTH_FAILED",
  "MODEL_DISCOVERY_PROVIDER_API_FAILED",
  "MODEL_DISCOVERY_NORMALIZATION_FAILED",
  "MODEL_DISCOVERY_CACHE_FAILED",

  // Model-level errors
  "MODEL_NOT_FOUND",
  "MODEL_NOT_ALLOWED",
  "MODEL_NOT_AVAILABLE_FOR_PROVIDER",

  // Resolution errors
  "RESOLUTION_FAILED",
  "NO_FALLBACK_AVAILABLE",
  "FALLBACK_CHAIN_EXHAUSTED",

  // Preference/config errors
  "INVALID_PREFERENCE_CONFIG",
  "INVALID_FALLBACK_CHAIN",

  // Rate limiting
  "RATE_LIMIT_EXCEEDED",
  "QUOTA_EXCEEDED",

  // Validation errors
  "VALIDATION_ERROR",
  "INVALID_REQUEST",
  "MISSING_REQUIRED_FIELD",

  // Encryption/secret errors
  "ENCRYPTION_FAILED",
  "DECRYPTION_FAILED",
  "KEY_VERSION_NOT_FOUND",

  // Scope/authorization errors
  "WORKSPACE_NOT_AUTHORIZED",
  "USER_NOT_AUTHORIZED",
  "CROSS_WORKSPACE_ACCESS_DENIED",

  // Internal/operational errors
  "INTERNAL_ERROR",
  "DEPENDENCY_FAILURE",
  "TIMEOUT",
  "CONFLICT",
]);

export type BYOKErrorCode = z.infer<typeof BYOKErrorCodeSchema>;

/**
 * BYOKError - Normalized error response (client-safe)
 *
 * Always safe to return to client:
 * - No plaintext secrets
 * - No stack traces
 * - Clear, actionable error codes
 * - Optional retry guidance
 * - NO internal debugging details
 *
 * Use `createBYOKError()` helper or `BYOKErrorInternal` for internal debugging.
 */
export const BYOKErrorSchema = z.object({
  /** Error code (machine-readable, stable for UI handling) */
  code: BYOKErrorCodeSchema,

  /** User-friendly message (no secrets, no internals) */
  message: z.string().min(1),

  /** Whether the client should retry */
  retryable: z.boolean().default(false),

  /** Correlation ID for logging/support */
  correlationId: z.string().optional(),

  /** If retryable, suggest delay (milliseconds) */
  retryAfterMs: z.number().int().positive().optional(),
});

export type BYOKError = z.infer<typeof BYOKErrorSchema>;

/**
 * BYOKErrorInternal - Internal error with debugging context
 *
 * Should NEVER be exposed to clients. Use `BYOKError` for HTTP responses.
 * Internal services can use this for logging/debugging.
 */
export const BYOKErrorInternalSchema = BYOKErrorSchema.extend({
  /** Detailed context for debugging (internal only, may expose internals) */
  details: z.record(z.unknown()).optional(),
});

export type BYOKErrorInternal = z.infer<typeof BYOKErrorInternalSchema>;

/**
 * BYOKErrorEnvelope - Standard error response envelope
 *
 * All BYOK API errors are returned in this format.
 */
export const BYOKErrorEnvelopeSchema = z.object({
  error: BYOKErrorSchema,
});

export type BYOKErrorEnvelope = z.infer<typeof BYOKErrorEnvelopeSchema>;

/**
 * Validation Error Details - Specific field validation failures
 *
 * All fields are required and non-empty to be meaningful to clients.
 */
export const BYOKValidationErrorDetailSchema = z.object({
  field: z.string().min(1),
  code: z.string().min(1),
  message: z.string().min(1),
});

export type BYOKValidationErrorDetail = z.infer<
  typeof BYOKValidationErrorDetailSchema
>;

/**
 * Validation Error Response - Detailed validation failures
 */
export const BYOKValidationErrorResponseSchema = z.object({
  error: BYOKErrorSchema,
  validationErrors: z.array(BYOKValidationErrorDetailSchema).optional(),
});

export type BYOKValidationErrorResponse = z.infer<
  typeof BYOKValidationErrorResponseSchema
>;

/**
 * Helper: Is error retryable?
 */
export const RETRYABLE_ERRORS: Set<BYOKErrorCode> = new Set([
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_RATE_LIMITED",
  "MODEL_DISCOVERY_PROVIDER_API_FAILED",
  "MODEL_DISCOVERY_CACHE_FAILED",
  "RATE_LIMIT_EXCEEDED",
  "QUOTA_EXCEEDED",
  "TIMEOUT",
  "DEPENDENCY_FAILURE",
]);

export function isRetryableError(code: BYOKErrorCode): boolean {
  return RETRYABLE_ERRORS.has(code);
}

/**
 * Helper: Is error an auth/access issue?
 */
export const AUTH_ERRORS: Set<BYOKErrorCode> = new Set([
  "PROVIDER_AUTH_FAILED",
  "MODEL_DISCOVERY_AUTH_FAILED",
  "CREDENTIAL_REVOKED",
  "CREDENTIAL_EXPIRED",
  "WORKSPACE_NOT_AUTHORIZED",
  "USER_NOT_AUTHORIZED",
  "CROSS_WORKSPACE_ACCESS_DENIED",
]);

export function isAuthError(code: BYOKErrorCode): boolean {
  return AUTH_ERRORS.has(code);
}

/**
 * Guard: Validate retryAfterMs is a positive integer
 */
function isPositiveInteger(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

/**
 * Helper: Create a normalized client-safe error
 *
 * Returns `BYOKError` which is safe to return to clients.
 * For internal debugging with details, use `createBYOKErrorInternal()`.
 */
export function createBYOKError(
  code: BYOKErrorCode,
  message: string,
  options?: {
    retryable?: boolean;
    correlationId?: string;
    retryAfterMs?: number;
  },
): BYOKError {
  if (
    options?.retryAfterMs !== undefined &&
    !isPositiveInteger(options.retryAfterMs)
  ) {
    throw new Error(
      `retryAfterMs must be a positive integer, got: ${options.retryAfterMs}`,
    );
  }

  return {
    code,
    message,
    retryable: options?.retryable ?? isRetryableError(code),
    correlationId: options?.correlationId,
    retryAfterMs: options?.retryAfterMs,
  };
}

/**
 * Helper: Create an internal error with debugging context
 *
 * Should NEVER be exposed to clients. Use `createBYOKError()` for HTTP responses.
 */
export function createBYOKErrorInternal(
  code: BYOKErrorCode,
  message: string,
  options?: {
    retryable?: boolean;
    correlationId?: string;
    details?: Record<string, unknown>;
    retryAfterMs?: number;
  },
): BYOKErrorInternal {
  if (
    options?.retryAfterMs !== undefined &&
    !isPositiveInteger(options.retryAfterMs)
  ) {
    throw new Error(
      `retryAfterMs must be a positive integer, got: ${options.retryAfterMs}`,
    );
  }

  return {
    code,
    message,
    retryable: options?.retryable ?? isRetryableError(code),
    correlationId: options?.correlationId,
    details: options?.details,
    retryAfterMs: options?.retryAfterMs,
  };
}
