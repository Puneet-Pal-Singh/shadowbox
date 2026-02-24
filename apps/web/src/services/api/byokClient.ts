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
  BYOKResolveRequest,
  BYOKCredential,
  BYOKPreference,
  ProviderRegistryEntry,
} from "@repo/shared-types";
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

/**
 * Resolve for chat request
 */
export type ResolveChatRequest = BYOKResolveRequest;

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
  private static readonly SESSION_RUN_ID_KEY = "currentRunId";

  /**
   * GET /api/byok/providers (catalog)
   */
  async getCatalog(): Promise<ProviderRegistryEntry[]> {
    return this.get<ProviderRegistryEntry[]>("/providers");
  }

  /**
   * GET /api/byok/credentials
   */
  async getCredentials(): Promise<BYOKCredential[]> {
    return this.get<BYOKCredential[]>("/credentials");
  }

  /**
   * POST /api/byok/credentials (connect)
   */
  async connectCredential(
    req: ConnectCredentialRequest
  ): Promise<BYOKCredential> {
    return this.post<BYOKCredential>("/credentials", req);
  }

  /**
   * PATCH /api/byok/credentials/:credentialId (update)
   */
  async updateCredential(
    credentialId: string,
    req: UpdateCredentialRequest
  ): Promise<BYOKCredential> {
    return this.patch<BYOKCredential>(
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
  async getPreferences(): Promise<BYOKPreference> {
    return this.get<BYOKPreference>("/preferences");
  }

  /**
   * PATCH /api/byok/preferences
   */
  async updatePreferences(
    req: Partial<BYOKPreference>
  ): Promise<BYOKPreference> {
    return this.patch<BYOKPreference>("/preferences", req);
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

  private createHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const runId = this.resolveRunId();
    if (runId) {
      headers["X-Run-Id"] = runId;
    }

    return headers;
  }

  private resolveRunId(): string | null {
    try {
      const runId = sessionStorage.getItem(ByokApiClient.SESSION_RUN_ID_KEY);
      if (runId) {
        return runId;
      }
    } catch {
      // No-op: continue to fallback lookup.
    }

    return SessionStateService.loadActiveSessionRunId();
  }

  /**
   * Handle error responses with BYOK error envelope
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorData: Record<string, unknown> = {};

    try {
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        errorData = await response.json();
      }
    } catch {
      // Ignore JSON parse errors, use default error
    }

    const error = (errorData.error || {}) as Record<string, unknown>;
    const message = (error.message as string) || `HTTP ${response.status}`;
    const code = (error.code as string) || "API_ERROR";
    const correlationId = error.correlationId as string | undefined;

    throw new ByokApiError(response.status, code, message, correlationId);
  }
}
