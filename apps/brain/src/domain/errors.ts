/**
 * Domain error taxonomy for Brain.
 *
 * Single Responsibility: Define typed, categorized errors for consistent
 * error handling and mapping across application layers.
 *
 * All errors include:
 * - code: Machine-readable error code for categorization
 * - message: Human-readable error message
 * - retryable: Whether the operation can be safely retried
 * - correlationId: For request tracing
 */

/**
 * Base domain error with standardized properties.
 */
export class DomainError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly retryable: boolean;
  public readonly correlationId?: string;

  constructor(
    code: string,
    message: string,
    status: number = 500,
    retryable: boolean = false,
    correlationId?: string,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.correlationId = correlationId;
    this.name = this.constructor.name;
  }
}

/**
 * Validation error: malformed request, invalid schema, out-of-range values.
 */
export class ValidationError extends DomainError {
  constructor(
    message: string,
    code: string = "VALIDATION_ERROR",
    correlationId?: string,
  ) {
    super(code, message, 400, false, correlationId);
  }
}

/**
 * Policy error: request violates business rules or constraints.
 * Examples: agent type not supported, fallback disabled, mode incompatible.
 */
export class PolicyError extends DomainError {
  constructor(
    message: string,
    code: string = "POLICY_ERROR",
    correlationId?: string,
  ) {
    super(code, message, 400, false, correlationId);
  }
}

/**
 * Dependency error: external service unavailable, connection failed.
 */
export class DependencyError extends DomainError {
  constructor(
    message: string,
    code: string = "DEPENDENCY_ERROR",
    retryable: boolean = true,
    correlationId?: string,
  ) {
    super(code, message, 503, retryable, correlationId);
  }
}

/**
 * Provider error: provider connection failed, invalid credentials, model not found.
 */
export class ProviderError extends DomainError {
  constructor(
    message: string,
    code: string = "PROVIDER_ERROR",
    status: number = 400,
    retryable: boolean = false,
    correlationId?: string,
  ) {
    super(code, message, status, retryable, correlationId);
  }
}

/**
 * Not found error: resource does not exist.
 */
export class NotFoundError extends DomainError {
  constructor(
    message: string,
    code: string = "NOT_FOUND",
    correlationId?: string,
  ) {
    super(code, message, 404, false, correlationId);
  }
}

/**
 * Parse error: malformed JSON, unparseable body.
 */
export class ParseError extends DomainError {
  constructor(
    message: string,
    code: string = "PARSE_ERROR",
    correlationId?: string,
  ) {
    super(code, message, 400, false, correlationId);
  }
}

/**
 * Type guard: check if an error is a domain error with typed properties.
 */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

/**
 * Map domain errors to HTTP response details.
 * Used by controllers to convert typed domain errors to standardized HTTP responses.
 *
 * @param error - The domain error to map
 * @returns { status, code, message } for HTTP response
 */
export function mapDomainErrorToHttp(error: DomainError): {
  status: number;
  code: string;
  message: string;
} {
  return {
    status: error.status,
    code: error.code,
    message: error.message,
  };
}
