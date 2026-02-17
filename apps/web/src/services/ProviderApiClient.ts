/**
 * ProviderApiClient
 * Client for consuming backend provider API endpoints
 * Single Responsibility: HTTP client for provider operations
 */

import { getEndpoint } from "../lib/platform-endpoints";
import type {
  ProviderId,
  ConnectProviderRequest,
  ConnectProviderResponse,
  DisconnectProviderRequest,
  DisconnectProviderResponse,
  ModelsListResponse,
  ProviderConnectionStatus,
} from "../types/provider";

/**
 * ProviderApiClient - Backend API client for provider operations
 *
 * Replaces direct provider operations with backend-authoritative API calls.
 * Never stores API keys locally - all credential handling is server-side.
 */
export class ProviderApiClient {
  /**
   * Connect a provider with backend validation
   */
  static async connect(
    request: ConnectProviderRequest,
  ): Promise<ConnectProviderResponse> {
    try {
      const endpoint = getEndpoint("PROVIDER_CONNECT");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("[provider/api] Connect failed:", error);
        throw new Error(error.error || "Failed to connect provider");
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
      const endpoint = getEndpoint("PROVIDER_DISCONNECT");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("[provider/api] Disconnect failed:", error);
        throw new Error(error.error || "Failed to disconnect provider");
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
      const endpoint = getEndpoint("PROVIDER_STATUS");
      const response = await fetch(endpoint, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("[provider/api] Status fetch failed:", error);
        throw new Error(error.error || "Failed to fetch provider status");
      }

      const data = await response.json();
      console.log("[provider/api] Fetched provider status");

      return data.providers;
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
      const endpoint = new URL(
        getEndpoint("PROVIDER_MODELS"),
      );
      endpoint.searchParams.set("providerId", providerId);

      const response = await fetch(endpoint.toString(), {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const error = await response.json();
        console.error(
          "[provider/api] Models fetch failed:",
          error,
        );
        throw new Error(error.error || "Failed to fetch models");
      }

      const data = await response.json();
      console.log(
        `[provider/api] Fetched ${data.models.length} models for ${providerId}`,
      );

      return data;
    } catch (error) {
      console.error("[provider/api] Models error:", error);
      throw error;
    }
  }
}
