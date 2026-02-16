/**
 * API Error Handling - Standard error shape for all API calls
 * Normalizes errors from different services into a common contract
 */

/**
 * Standard error shape for all API responses
 * Ensures consistent error handling across the application
 */
export interface ApiErrorShape {
  code: string;
  message: string;
  retryable: boolean;
  requestId?: string;
  originalError?: unknown;
}

/**
 * Custom error class for API errors
 * Extends Error with additional context for debugging and retry logic
 */
export class ApiError extends Error implements ApiErrorShape {
  code: string;
  message: string;
  retryable: boolean;
  requestId?: string;
  originalError?: unknown;

  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.name = "ApiError";
    this.code = shape.code;
    this.message = shape.message;
    this.retryable = shape.retryable;
    this.requestId = shape.requestId;
    this.originalError = shape.originalError;
  }

  toShape(): ApiErrorShape {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      requestId: this.requestId,
      originalError: this.originalError,
    };
  }
}

/**
 * Normalize a fetch response or error into standard ApiErrorShape
 * Handles various error scenarios (network, HTTP errors, parse errors)
 */
export function normalizeApiError(error: unknown): ApiErrorShape {
  // Handle already-normalized ApiError
  if (error instanceof ApiError) {
    return error.toShape();
  }

  // Handle Response objects (HTTP errors)
  if (error instanceof Response) {
    const retryable = error.status >= 500 || error.status === 408 || error.status === 429;
    const requestId = error.headers.get("X-Request-ID") ?? undefined;

    return {
      code: `HTTP_${error.status}`,
      message: `${error.statusText || "HTTP Error"}: ${error.status}`,
      retryable,
      requestId,
      originalError: error,
    };
  }

  // Handle AbortError/timeout (abort controller timeout)
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error instanceof DOMException)
  ) {
    return {
      code: "TIMEOUT_ERROR",
      message: "Request timed out. Please try again.",
      retryable: true,
      originalError: error,
    };
  }

  // Handle network errors - broader detection for fetch failures
  if (error instanceof TypeError) {
    // Check for network-related error patterns
    const message = error.message.toLowerCase();
    const isNetworkError =
      message.includes("fetch") ||
      message.includes("failed to fetch") ||
      message.includes("networkerror") ||
      message.includes("network error") ||
      message === ""; // Empty message often indicates network error

    if (isNetworkError) {
      return {
        code: "NETWORK_ERROR",
        message: "Network request failed. Check your connection.",
        retryable: true,
        originalError: error,
      };
    }
  }

  // Handle timeout errors (message-based)
  if (error instanceof Error && error.message.toLowerCase().includes("timeout")) {
    return {
      code: "TIMEOUT_ERROR",
      message: "Request timed out. Please try again.",
      retryable: true,
      originalError: error,
    };
  }

  // Handle generic Error objects
  if (error instanceof Error) {
    return {
      code: "UNKNOWN_ERROR",
      message: error.message || "An unknown error occurred",
      retryable: false,
      originalError: error,
    };
  }

  // Handle unknown errors - safely stringify
  let message: string;
  try {
    message = JSON.stringify(error);
  } catch {
    // Fallback for circular references or non-serializable objects
    message = String(error) || "<unserializable error>";
  }

  return {
    code: "UNKNOWN_ERROR",
    message: message || "An unknown error occurred",
    retryable: false,
    originalError: error,
  };
}

/**
 * Determine if an error is retryable
 * Used in retry logic to decide if a failed request should be retried
 */
export function isRetryableError(error: ApiErrorShape | unknown): boolean {
  if (error instanceof ApiError) {
    return error.retryable;
  }

  if (typeof error === "object" && error !== null && "retryable" in error) {
    return Boolean((error as Record<string, unknown>).retryable);
  }

  return false;
}

/**
 * Log an API error with context
 * Uses standardized logging format from AGENTS.md conventions
 */
export function logApiError(error: ApiErrorShape, service: string): void {
  console.error(`[api/${service}] Error ${error.code}:`, {
    message: error.message,
    retryable: error.retryable,
    requestId: error.requestId,
  });
}
