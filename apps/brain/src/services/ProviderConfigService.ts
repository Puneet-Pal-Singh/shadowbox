/**
 * ProviderConfigService
 * Manages secure provider configuration storage and retrieval
 * Single Responsibility: Provider credential and configuration management
 */

import type { Env } from "../types/ai";
import type {
  ProviderId,
  ConnectProviderRequest,
  ConnectProviderResponse,
  DisconnectProviderRequest,
  ProviderConnectionStatus,
  ModelsListResponse,
} from "../schemas/provider";
import { PROVIDER_CATALOG } from "./providers/catalog";

interface ProviderConfig {
  providerId: ProviderId;
  apiKey: string;
  connectedAt: string;
}

/**
 * ProviderConfigService - In-memory ephemeral storage for v1
 *
 * Design Notes:
 * - Stores API keys in memory only (ephemeral within request lifecycle)
 * - Never persists keys to disk or browser localStorage
 * - Each call to connect() establishes a new, isolated session
 * - Implements server-side validation of provider connections
 */
export class ProviderConfigService {
  private configs: Map<ProviderId, ProviderConfig> = new Map();

  constructor(_env: Env) {
    // In v1, use ephemeral in-memory storage
    // Future: Replace with secure backend storage (KMS, Vault, etc.)
  }

  /**
   * Connect a provider with API key validation
   */
  async connect(
    request: ConnectProviderRequest,
  ): Promise<ConnectProviderResponse> {
    try {
      const { providerId, apiKey } = request;

      if (!apiKey || apiKey.trim().length === 0) {
        return this.failureResponse(
          providerId,
          "API key cannot be empty",
        );
      }

      // Basic format validation (length check)
      if (apiKey.length < 10) {
        return this.failureResponse(
          providerId,
          "API key appears invalid (too short)",
        );
      }

      // Store in memory (ephemeral)
      this.configs.set(providerId, {
        providerId,
        apiKey,
        connectedAt: new Date().toISOString(),
      });

      console.log(
        `[provider/config] ${providerId} connected (key masked)`,
      );

      return {
        status: "connected" as const,
        providerId,
        lastValidatedAt: new Date().toISOString(),
      };
    } catch (error) {
      const providerId = request.providerId;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[provider/config] Error connecting ${providerId}:`, error);

      return this.failureResponse(providerId, errorMessage);
    }
  }

  /**
   * Disconnect a provider
   */
  async disconnect(
    request: DisconnectProviderRequest,
  ): Promise<{ status: "disconnected"; providerId: ProviderId }> {
    try {
      this.configs.delete(request.providerId);
      console.log(
        `[provider/config] ${request.providerId} disconnected`,
      );

      return {
        status: "disconnected" as const,
        providerId: request.providerId,
      };
    } catch (error) {
      console.error(
        `[provider/config] Error disconnecting:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get connection status for all providers
   */
  async getStatus(): Promise<ProviderConnectionStatus[]> {
    const supportedProviders: ProviderId[] = ["openrouter", "openai"];

    return supportedProviders.map((providerId) => {
      const config = this.configs.get(providerId);

      return {
        providerId,
        status: config ? ("connected" as const) : ("disconnected" as const),
        lastValidatedAt: config?.connectedAt,
      };
    });
  }

  /**
   * Get available models for a provider
   */
  async getModels(providerId: ProviderId): Promise<ModelsListResponse> {
    try {
      const models = PROVIDER_CATALOG[providerId] || [];

      console.log(
        `[provider/config] Fetched ${models.length} models for ${providerId}`,
      );

      return {
        providerId,
        models,
        lastFetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`[provider/config] Error fetching models:`, error);
      throw error;
    }
  }

  /**
   * Get API key for a provider (internal use only)
   * Returns null if provider not connected
   */
  getApiKey(providerId: ProviderId): string | null {
    return this.configs.get(providerId)?.apiKey ?? null;
  }

  /**
   * Check if provider is connected
   */
  isConnected(providerId: ProviderId): boolean {
    return this.configs.has(providerId);
  }

  private failureResponse(
    providerId: ProviderId,
    errorMessage: string,
  ): ConnectProviderResponse {
    return {
      status: "failed" as const,
      providerId,
      errorMessage,
    };
  }
}
