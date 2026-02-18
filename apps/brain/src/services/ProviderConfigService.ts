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

const providerConfigStore: Map<ProviderId, ProviderConfig> = new Map();

/**
 * ProviderConfigService - In-memory ephemeral storage for v1
 *
 * ⚠️ IMPORTANT: Ephemeral Storage Limitation
 * - Stores API keys in memory only (scoped to Cloudflare Worker isolate lifecycle)
 * - Keys are LOST on worker restart, deployment, or isolate reuse
 * - Cloudflare Workers are ephemeral; this is not suitable for production multi-request persistence
 *
 * For M1.3+, migrate to:
 * - Cloudflare KV (namespace-scoped, encrypted at rest)
 * - Cloudflare Durable Objects (persistent, consistent)
 * - OR use a backend vault service (HashiCorp Vault, AWS KMS)
 *
 * Design Notes (v1 current approach):
 * - Stores API keys in memory only (persists within single isolate)
 * - Never persists keys to disk or browser localStorage
 * - Singleton instance provides per-isolate state persistence
 * - Server-side validation of provider connections
 * - All credentials handled server-side, never exposed to client
 */
export class ProviderConfigService {
  private configs: Map<ProviderId, ProviderConfig>;

  constructor(_env: Env) {
    this.configs = providerConfigStore;
    // In v1, use ephemeral in-memory storage
    // Future: Replace with secure backend storage (KMS, Vault, etc.)
  }

  /**
   * Connect a provider with API key validation
   *
   * Zod schema validates:
   * - Not empty
   * - Minimum length (10+ chars)
   * - Format (alphanumeric, hyphens, underscores only)
   *
   * Note: Schema validation happens before this method is called.
   * This method only stores the credential and tracks connection time.
   */
  async connect(
    request: ConnectProviderRequest,
  ): Promise<ConnectProviderResponse> {
    try {
      const { providerId, apiKey } = request;

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

  /**
   * Reset provider config state for tests
   * Static method for test isolation
   * ⚠️ SECURITY: Only available in test environments
   * @throws Error if called in production environments
   */
  static resetForTests(): void {
    if (process.env.NODE_ENV !== "test") {
      throw new Error(
        "ProviderConfigService.resetForTests() is only available in test environments. " +
        "This prevents accidental credential wipe in production.",
      );
    }
    providerConfigStore.clear();
  }
}

/**
 * Test-only export: reset provider config state
 * Only available in test environments
 * @deprecated Use ProviderConfigService.resetForTests() instead
 */
if (process.env.NODE_ENV === "test") {
  (globalThis as any).__resetProviderConfigForTests = () => {
    providerConfigStore.clear();
  };
}
