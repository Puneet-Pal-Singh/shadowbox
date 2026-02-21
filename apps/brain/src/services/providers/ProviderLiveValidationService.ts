import type { ProviderId } from "@repo/shared-types";
import { ProviderError, ValidationError } from "../../domain/errors";
import type { Env } from "../../types/ai";

interface ProviderLiveValidationConfig {
  enabled: boolean;
  timeoutMs: number;
}

type ProviderFetch = typeof fetch;

interface ProviderValidationEndpoint {
  url: string;
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class ProviderLiveValidationService {
  constructor(
    private readonly config: ProviderLiveValidationConfig,
    private readonly providerFetch: ProviderFetch = fetch,
  ) {}

  static fromEnv(
    env: Env,
    providerFetch: ProviderFetch = fetch,
  ): ProviderLiveValidationService {
    return new ProviderLiveValidationService(
      {
        enabled: env.BYOK_VALIDATE_LIVE_ENABLED === "true",
        timeoutMs: parseTimeoutMs(env.BYOK_VALIDATE_LIVE_TIMEOUT_MS),
      },
      providerFetch,
    );
  }

  ensureEnabled(correlationId?: string): void {
    if (this.config.enabled) {
      return;
    }
    throw new ValidationError(
      "BYOK live validation mode is disabled for this environment.",
      "VALIDATION_ERROR",
      correlationId,
    );
  }

  async validate(providerId: ProviderId, apiKey: string): Promise<void> {
    const endpoint = resolveValidationEndpoint(providerId);
    const response = await this.fetchWithTimeout(endpoint, apiKey);
    if (response.ok) {
      return;
    }
    throw mapProviderErrorFromResponse(providerId, response.status);
  }

  private async fetchWithTimeout(
    endpoint: ProviderValidationEndpoint,
    apiKey: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      return await this.providerFetch(endpoint.url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...endpoint.headers,
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new ProviderError(
          "Live provider validation timed out.",
          "PROVIDER_UNAVAILABLE",
          503,
          true,
        );
      }
      throw new ProviderError(
        "Live provider validation failed due to a network error.",
        "PROVIDER_UNAVAILABLE",
        503,
        true,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function resolveValidationEndpoint(providerId: ProviderId): ProviderValidationEndpoint {
  switch (providerId) {
    case "openai":
      return { url: "https://api.openai.com/v1/models" };
    case "openrouter":
      return {
        url: "https://openrouter.ai/api/v1/key",
        headers: {
          "HTTP-Referer": "https://shadowbox.dev",
          "X-Title": "Shadowbox BYOK Live Validate",
        },
      };
    case "groq":
      return { url: "https://api.groq.com/openai/v1/models" };
  }
}

function mapProviderErrorFromResponse(
  providerId: ProviderId,
  status: number,
): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError(
      `Provider "${providerId}" rejected BYOK credential during live validation.`,
      "AUTH_FAILED",
      401,
      false,
    );
  }

  if (status === 429) {
    return new ProviderError(
      `Provider "${providerId}" is rate-limiting validation traffic.`,
      "RATE_LIMITED",
      429,
      true,
    );
  }

  return new ProviderError(
    `Provider "${providerId}" live validation failed with status ${status}.`,
    "PROVIDER_UNAVAILABLE",
    503,
    true,
  );
}

function parseTimeoutMs(value: string | undefined): number {
  if (!value) {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return parsed;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  return error instanceof Error && error.name === "AbortError";
}
