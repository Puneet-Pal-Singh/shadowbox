/**
 * ProviderApiClient
 * Client for consuming backend provider API endpoints
 * Single Responsibility: HTTP client for provider operations
 */

import { getEndpoint } from "../lib/platform-endpoints";
import { SessionStateService } from "./SessionStateService";
import type {
  BYOKPreferences,
  BYOKPreferencesPatch,
  ProviderCatalogResponse,
  ProviderConnectionsResponse,
} from "@repo/shared-types";
import type {
  ProviderId,
  ConnectProviderRequest,
  ConnectProviderResponse,
  DisconnectProviderRequest,
  DisconnectProviderResponse,
  ModelsListResponse,
  ProviderConnectionStatus,
} from "../types/provider";

const SESSION_RUN_ID_KEY = "currentRunId";

/**
 * ProviderApiClient - Backend API client for provider operations
 *
 * Replaces direct provider operations with backend-authoritative API calls.
 * Never stores API keys locally - all credential handling is server-side.
 */
export class ProviderApiClient {
  private static readSessionRunId(): string | null {
    try {
      return sessionStorage.getItem(SESSION_RUN_ID_KEY);
    } catch (error) {
      console.error("[provider/api] Failed to read run ID from sessionStorage", error);
      return null;
    }
  }

  private static resolveRunId(): string | null {
    const sessionRunId = ProviderApiClient.readSessionRunId();
    if (sessionRunId) {
      return sessionRunId;
    }

    return SessionStateService.loadActiveSessionRunId();
  }

  private static createHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const runId = ProviderApiClient.resolveRunId();
    if (runId) {
      headers["X-Run-Id"] = runId;
    } else {
      console.warn("[provider/api] No active runId found; X-Run-Id header omitted");
    }

    return headers;
  }

  /**
   * Safely parse response body with JSON/text fallback for error messages
   * IMPORTANT: Response body can only be consumed once. Read as text first, then parse.
   */
  private static async parseErrorResponse(response: Response): Promise<string> {
    try {
      // Read body as text first (can only be consumed once)
      const text = await response.text();

      // Try to parse as JSON
      if (text.trim()) {
        try {
          const data = JSON.parse(text) as Record<string, unknown>;
          const nestedError =
            data.error && typeof data.error === "object"
              ? (data.error as Record<string, unknown>)
              : undefined;
          if (typeof data.error === "string") {
            return data.error;
          }
          if (typeof nestedError?.message === "string") {
            return nestedError.message;
          }
          if (typeof data.message === "string") {
            return data.message;
          }
          return JSON.stringify(data);
        } catch {
          // Return raw text if JSON parsing fails
          return text;
        }
      }

      return "No response body";
    } catch {
      // Fallback if text reading fails
      return "Failed to read response body";
    }
  }

  /**
   * Connect a provider with backend validation
   */
  static async connect(
    request: ConnectProviderRequest,
  ): Promise<ConnectProviderResponse> {
    try {
      const endpoint = getEndpoint("BYOK_PROVIDER_CONNECT");
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: ProviderApiClient.createHeaders(),
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorMessage = await ProviderApiClient.parseErrorResponse(response);
        console.error(
          `[provider/api] Connect failed (${response.status}):`,
          errorMessage,
        );
        throw new Error(
          `Failed to connect provider (${response.status}): ${errorMessage}`,
        );
      }

      const data = await response.json();
      console.log(
        `[provider/api] Connected ${request.providerId} successfully`,
      );

      return data;
    } catch (error) {
      console.error("[provider/api] Connect error:", error);
      throw error;
    }
  }

  /**
   * Disconnect a provider
   */
  static async disconnect(
    request: DisconnectProviderRequest,
  ): Promise<DisconnectProviderResponse> {
    try {
      const endpoint = getEndpoint("BYOK_PROVIDER_DISCONNECT");
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: ProviderApiClient.createHeaders(),
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorMessage = await ProviderApiClient.parseErrorResponse(response);
        console.error(
          `[provider/api] Disconnect failed (${response.status}):`,
          errorMessage,
        );
        throw new Error(
          `Failed to disconnect provider (${response.status}): ${errorMessage}`,
        );
      }

      const data = await response.json();
      console.log(`[provider/api] Disconnected ${request.providerId}`);

      return data;
    } catch (error) {
      console.error("[provider/api] Disconnect error:", error);
      throw error;
    }
  }

  /**
   * Get provider connection status
   */
  static async getStatus(): Promise<ProviderConnectionStatus[]> {
    try {
      const endpoint = getEndpoint("BYOK_PROVIDER_CONNECTIONS");
      const response = await fetch(endpoint, {
        method: "GET",
        credentials: "include",
        headers: ProviderApiClient.createHeaders(),
      });

      if (!response.ok) {
        const errorMessage = await ProviderApiClient.parseErrorResponse(response);
        console.error(
          `[provider/api] Status fetch failed (${response.status}):`,
          errorMessage,
        );
        throw new Error(
          `Failed to fetch provider status (${response.status}): ${errorMessage}`,
        );
      }

      const data = (await response.json()) as ProviderConnectionsResponse;
      console.log("[provider/api] Fetched provider status");

      return data.connections as ProviderConnectionStatus[];
    } catch (error) {
      console.error("[provider/api] Status error:", error);
      throw error;
    }
  }

  /**
   * Get available models for a provider
   */
  static async getModels(
    providerId: ProviderId,
  ): Promise<ModelsListResponse> {
    try {
      const endpoint = getEndpoint("BYOK_PROVIDER_CATALOG");
      const response = await fetch(endpoint, {
        method: "GET",
        credentials: "include",
        headers: ProviderApiClient.createHeaders(),
      });

      if (!response.ok) {
        const errorMessage = await ProviderApiClient.parseErrorResponse(response);
        console.error(
          `[provider/api] Models fetch failed (${response.status}):`,
          errorMessage,
        );
        throw new Error(
          `Failed to fetch models (${response.status}): ${errorMessage}`,
        );
      }

      const data = (await response.json()) as ProviderCatalogResponse;
      if (!Array.isArray(data.providers)) {
        throw new Error("Invalid BYOK catalog response: missing providers array");
      }
      const providerCatalog = data.providers.find(
        (entry) => entry.providerId === providerId,
      );

      if (!providerCatalog) {
        throw new Error(`Provider ${providerId} not found in BYOK catalog`);
      }

      const modelsResponse: ModelsListResponse = {
        providerId,
        models: providerCatalog.models,
        lastFetchedAt: data.generatedAt,
      };
      console.log(
        `[provider/api] Fetched ${modelsResponse.models.length} models for ${providerId}`,
      );

      return modelsResponse;
    } catch (error) {
      console.error("[provider/api] Models error:", error);
      throw error;
    }
  }

  /**
   * Get persisted BYOK preferences.
   */
  static async getPreferences(): Promise<BYOKPreferences> {
    try {
      const endpoint = getEndpoint("BYOK_PREFERENCES");
      const response = await fetch(endpoint, {
        method: "GET",
        credentials: "include",
        headers: ProviderApiClient.createHeaders(),
      });

      if (!response.ok) {
        const errorMessage = await ProviderApiClient.parseErrorResponse(response);
        console.error(
          `[provider/api] Preferences fetch failed (${response.status}):`,
          errorMessage,
        );
        throw new Error(
          `Failed to fetch preferences (${response.status}): ${errorMessage}`,
        );
      }

      const data = (await response.json()) as BYOKPreferences;
      console.log("[provider/api] Fetched BYOK preferences");
      return data;
    } catch (error) {
      console.error("[provider/api] Preferences fetch error:", error);
      throw error;
    }
  }

  /**
   * Update persisted BYOK preferences.
   */
  static async updatePreferences(
    patch: BYOKPreferencesPatch,
  ): Promise<BYOKPreferences> {
    try {
      const endpoint = getEndpoint("BYOK_PREFERENCES");
      const response = await fetch(endpoint, {
        method: "PATCH",
        credentials: "include",
        headers: ProviderApiClient.createHeaders(),
        body: JSON.stringify(patch),
      });

      if (!response.ok) {
        const errorMessage = await ProviderApiClient.parseErrorResponse(response);
        console.error(
          `[provider/api] Preferences update failed (${response.status}):`,
          errorMessage,
        );
        throw new Error(
          `Failed to update preferences (${response.status}): ${errorMessage}`,
        );
      }

      const data = (await response.json()) as BYOKPreferences;
      console.log("[provider/api] Updated BYOK preferences");
      return data;
    } catch (error) {
      console.error("[provider/api] Preferences update error:", error);
      throw error;
    }
  }
}
