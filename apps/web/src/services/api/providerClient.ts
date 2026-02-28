/**
 * Provider API Client v3
 *
 * Typed HTTP client for provider credential endpoints.
 * All requests/responses validated against shared-types schemas.
 *
 * Usage:
 *   const client = new ProviderApiClient();
 *   const catalog = await client.getCatalog();
 *   const credential = await client.connectCredential({ providerId: 'openai', secret: '...' });
 */

import {
  BYOKResolution as ProviderResolution,
  BYOKResolveRequest as ProviderResolveRequest,
  BYOKCredential as ProviderCredential,
  BYOKPreference as ProviderPreference,
  type ModelDescriptor,
  ProviderRegistryEntry,
} from "@repo/shared-types";
import { getBrainHttpBase } from "../../lib/platform-endpoints.js";
import { SessionStateService } from "../SessionStateService";

/**
 * Connect credential request
 */
export interface ConnectCredentialRequest {
  providerId: string;
  secret: string;
  label?: string;
}

/**
 * Update credential request
 */
export interface UpdateCredentialRequest {
  label?: string;
}

/**
 * Validate credential request
 */
export interface ValidateCredentialRequest {
  mode: "format" | "live";
}

/**
 * Validate credential response
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface ProviderModelOption {
  id: string;
  name: string;
  provider?: string;
}

export interface RunIdResolver {
  getRunId(): string | null;
}

/**
 * Resolve for chat request
 */
export type ResolveChatRequest = ProviderResolveRequest;

/**
 * HTTP error wrapper for provider API failures
 */
export class ProviderApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public correlationId?: string
  ) {
    super(message);
    this.name = "ProviderApiError";
  }

  isRetryable(): boolean {
    return this.statusCode >= 500 || this.statusCode === 429;
  }
}

/**
 * ProviderApiClient - Typed HTTP client for provider APIs
 */
export class ProviderApiClient {
  // Keep `/api/byok` route for current backend contract compatibility.
  private baseUrl: string = `${getBrainHttpBase()}/api/byok`;
  private abortControllers: Map<string, AbortController> = new Map();
  private static readonly sessionRunIdKey = "currentRunId";
  private static readonly responsePreviewLimit = 120;

  constructor(
    private readonly runIdResolver: RunIdResolver = new DefaultRunIdResolver(
      ProviderApiClient.sessionRunIdKey
    )
  ) {}

  /**
   * GET /api/byok/providers (catalog)
   */
  async getCatalog(): Promise<ProviderRegistryEntry[]> {
    return this.get<ProviderRegistryEntry[]>("/providers");
  }

  /**
   * GET /api/byok/providers/:providerId/models
   */
  async getProviderModels(providerId: string): Promise<ProviderModelOption[]> {
    const models = await this.get<ModelDescriptor[]>(
      `/providers/${encodeURIComponent(providerId)}/models`
    );
    return models.map((model) => ({
      id: model.id,
      name: model.name,
      provider: model.provider,
    }));
  }

  /**
   * GET /api/byok/credentials
   */
  async getCredentials(): Promise<ProviderCredential[]> {
    return this.get<ProviderCredential[]>("/credentials");
  }

  /**
   * POST /api/byok/credentials (connect)
   */
  async connectCredential(
    req: ConnectCredentialRequest
  ): Promise<ProviderCredential> {
    return this.post<ProviderCredential>("/credentials", req);
  }

  /**
   * PATCH /api/byok/credentials/:credentialId (update)
   */
  async updateCredential(
    credentialId: string,
    req: UpdateCredentialRequest
  ): Promise<ProviderCredential> {
    return this.patch<ProviderCredential>(
      `/credentials/${credentialId}`,
      req
    );
  }

  /**
   * DELETE /api/byok/credentials/:credentialId (disconnect)
   */
  async disconnectCredential(credentialId: string): Promise<void> {
    await this.delete(`/credentials/${credentialId}`);
  }

  /**
   * POST /api/byok/credentials/:credentialId/validate
   */
  async validateCredential(
    credentialId: string,
    req: ValidateCredentialRequest
  ): Promise<ValidationResult> {
    return this.post<ValidationResult>(
      `/credentials/${credentialId}/validate`,
      req
    );
  }

  /**
   * GET /api/byok/preferences
   */
  async getPreferences(): Promise<ProviderPreference> {
    return this.get<ProviderPreference>("/preferences");
  }

  /**
   * PATCH /api/byok/preferences
   */
  async updatePreferences(
    req: Partial<ProviderPreference>
  ): Promise<ProviderPreference> {
    return this.patch<ProviderPreference>("/preferences", req);
  }

  /**
   * POST /api/byok/resolve (resolve for chat)
   */
  async resolveForChat(req: ResolveChatRequest): Promise<ProviderResolution> {
    return this.post<ProviderResolution>("/resolve", req);
  }

  /**
   * Abort any in-flight request for a given key
   */
  abort(key: string): void {
    const controller = this.abortControllers.get(key);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(key);
    }
  }

  /**
   * Internal GET helper
   */
  private async get<T>(
    path: string,
    options?: { signal?: AbortSignal }
  ): Promise<T> {
    return this.request<T>("GET", path, undefined, options);
  }

  /**
   * Internal POST helper
   */
  private async post<T>(
    path: string,
    body: unknown,
    options?: { signal?: AbortSignal }
  ): Promise<T> {
    return this.request<T>("POST", path, body, options);
  }

  /**
   * Internal PATCH helper
   */
  private async patch<T>(
    path: string,
    body: unknown,
    options?: { signal?: AbortSignal }
  ): Promise<T> {
    return this.request<T>("PATCH", path, body, options);
  }

  /**
   * Internal DELETE helper
   */
  private async delete(
    path: string,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    await this.request("DELETE", path, undefined, options);
  }

  /**
   * Core request handler with error mapping
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { signal?: AbortSignal }
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const signal = options?.signal;

    const fetchOptions: RequestInit = {
      method,
      credentials: "include",
      headers: this.createHeaders(),
      signal,
    };

    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      return await this.parseSuccessResponse<T>(response, method, path);
    } catch (error) {
      if (error instanceof ProviderApiError) {
        throw error;
      }

      // Network error or abort
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderApiError(0, "ABORTED", "Request was aborted");
      }

      throw new ProviderApiError(
        500,
        "NETWORK_ERROR",
        error instanceof Error ? error.message : "Network request failed"
      );
    }
  }

  private async parseSuccessResponse<T>(
    response: Response,
    method: string,
    path: string
  ): Promise<T> {
    if (response.status === 204 || method === "DELETE") {
      return undefined as T;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      const preview = await this.readResponsePreview(response);
      throw new ProviderApiError(
        502,
        "INVALID_RESPONSE_FORMAT",
        `Expected JSON response for ${method} ${path}${preview ? `; received: ${preview}` : ""}`
      );
    }

    try {
      const data = await response.json();
      return data as T;
    } catch {
      throw new ProviderApiError(
        502,
        "INVALID_RESPONSE_FORMAT",
        `Invalid JSON response for ${method} ${path}`
      );
    }
  }

  private createHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const runId = this.resolveRunId();
    if (!runId) {
      throw new ProviderApiError(
        400,
        "MISSING_RUN_ID",
        "Run ID is required for provider requests"
      );
    }
    headers["X-Run-Id"] = runId;

    return headers;
  }

  private resolveRunId(): string | null {
    return this.runIdResolver.getRunId();
  }

  /**
   * Handle error responses with provider error envelope
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorData: Record<string, unknown> = {};
    let message = `HTTP ${response.status}`;
    let code = "API_ERROR";
    let correlationId: string | undefined;

    try {
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        errorData = await response.json();
        const error = (errorData.error || {}) as Record<string, unknown>;
        message = (error.message as string) || message;
        code = (error.code as string) || code;
        correlationId = error.correlationId as string | undefined;
      } else {
        const preview = await this.readResponsePreview(response);
        if (preview) {
          message = `Unexpected non-JSON error response: ${preview}`;
          code = "INVALID_ERROR_RESPONSE";
        }
      }
    } catch {
      // Ignore JSON parse errors, use default error
    }

    throw new ProviderApiError(response.status, code, message, correlationId);
  }

  private async readResponsePreview(response: Response): Promise<string> {
    try {
      const text = (await response.text()).trim();
      if (!text) {
        return "";
      }
      return text.slice(0, ProviderApiClient.responsePreviewLimit);
    } catch (error) {
      console.warn(
        "[provider/readResponsePreview] Failed to read response text",
        error
      );
      return "";
    }
  }
}

class DefaultRunIdResolver implements RunIdResolver {
  constructor(private readonly runIdStorageKey: string) {}

  getRunId(): string | null {
    try {
      const runId = sessionStorage.getItem(this.runIdStorageKey);
      if (runId) {
        return runId;
      }
    } catch (error) {
      console.warn("[provider/resolveRunId] Failed to read sessionStorage", error);
    }

    return SessionStateService.loadActiveSessionRunId();
  }
}
