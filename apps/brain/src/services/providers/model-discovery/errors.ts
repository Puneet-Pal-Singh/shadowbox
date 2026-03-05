import { DomainError } from "../../../domain/errors";

type ProviderModelDiscoveryErrorCode =
  | "MODEL_DISCOVERY_AUTH_FAILED"
  | "MODEL_DISCOVERY_PROVIDER_API_FAILED"
  | "MODEL_DISCOVERY_NORMALIZATION_FAILED"
  | "MODEL_DISCOVERY_CACHE_FAILED";

abstract class ProviderModelDiscoveryError extends DomainError {
  protected constructor(
    code: ProviderModelDiscoveryErrorCode,
    message: string,
    status: number,
    retryable: boolean,
    correlationId?: string,
  ) {
    super(code, message, status, retryable, correlationId);
  }
}

export class ProviderModelDiscoveryAuthError extends ProviderModelDiscoveryError {
  constructor(message: string, correlationId?: string) {
    super("MODEL_DISCOVERY_AUTH_FAILED", message, 401, false, correlationId);
  }
}

export class ProviderModelDiscoveryApiError extends ProviderModelDiscoveryError {
  constructor(
    message: string,
    options?: {
      status?: number;
      retryable?: boolean;
      correlationId?: string;
    },
  ) {
    super(
      "MODEL_DISCOVERY_PROVIDER_API_FAILED",
      message,
      options?.status ?? 502,
      options?.retryable ?? true,
      options?.correlationId,
    );
  }
}

export class ProviderModelNormalizationError extends ProviderModelDiscoveryError {
  constructor(message: string, correlationId?: string) {
    super(
      "MODEL_DISCOVERY_NORMALIZATION_FAILED",
      message,
      500,
      false,
      correlationId,
    );
  }
}

export class ProviderModelCacheError extends ProviderModelDiscoveryError {
  constructor(message: string, correlationId?: string) {
    super("MODEL_DISCOVERY_CACHE_FAILED", message, 503, true, correlationId);
  }
}
