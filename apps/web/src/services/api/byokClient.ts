/**
 * BYOK API Client v3
 *
 * Typed HTTP client for BYOK v3 endpoints.
 * All requests/responses validated against shared-types schemas.
 *
 * Usage:
 *   const client = new ByokApiClient();
 *   const catalog = await client.getCatalog();
 *   const credential = await client.connectCredential({ providerId: 'openai', secret: '...' });
 */

import {
  BYOKResolution,
  BYOKError,
  BYOKResolveRequest,
  ProviderCatalogEntry,
  ProviderCredential,
  WorkspacePreferences,
} from "@repo/shared-types";

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

/**
 * Update preferences request
 */
export interface UpdatePreferencesRequest
  extends Partial<WorkspacePreferences> {}

/**
 * Resolve for chat request
 */
export interface ResolveChatRequest extends BYOKResolveRequest {}

/**
 * HTTP error wrapper with BYOK semantics
 */
export class ByokApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public correlationId?: string
  ) {
    super(message);
    this.name = "ByokApiError";
  }

  isRetryable(): boolean {
    return this.statusCode >= 500 || this.statusCode === 429;
  }
}

/**
 * ByokApiClient - Typed HTTP client for BYOK v3 APIs
 */
export class ByokApiClient {
  private baseUrl: string = "/api/byok";
  private abortControllers: Map<string, AbortController> = new Map();

  /**
   * GET /api/byok/providers (catalog)
   */
  async getCatalog(): Promise<ProviderCatalogEntry[]> {
    return this.get<ProviderCatalogEntry[]>("/providers");
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
  async getPreferences(): Promise<WorkspacePreferences> {
    return this.get<WorkspacePreferences>("/preferences");
  }

  /**
   * PATCH /api/byok/preferences
   */
  async updatePreferences(
    req: UpdatePreferencesRequest
  ): Promise<WorkspacePreferences> {
    return this.patch<WorkspacePreferences>("/preferences", req);
  }

  /**
   * POST /api/byok/resolve (resolve for chat)
   */
  async resolveForChat(req: ResolveChatRequest): Promise<BYOKResolution> {
    return this.post<BYOKResolution>("/resolve", req);
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
      headers: {
        "Content-Type": "application/json",
      },
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

      if (method === "DELETE" && response.status === 204) {
        return undefined as T;
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      if (error instanceof ByokApiError) {
        throw error;
      }

      // Network error or abort
      if (error instanceof Error && error.name === "AbortError") {
        throw new ByokApiError(0, "ABORTED", "Request was aborted");
      }

      throw new ByokApiError(
        500,
        "NETWORK_ERROR",
        error instanceof Error ? error.message : "Network request failed"
      );
    }
  }

  /**
   * Handle error responses with BYOK error envelope
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorData: any = {};

    try {
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        errorData = await response.json();
      }
    } catch {
      // Ignore JSON parse errors, use default error
    }

    const error = errorData.error || {};
    const message = error.message || `HTTP ${response.status}`;
    const code = error.code || "API_ERROR";
    const correlationId = error.correlationId;

    throw new ByokApiError(response.status, code, message, correlationId);
  }
}
