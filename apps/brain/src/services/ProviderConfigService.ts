/**
 * ProviderConfigService
 * Manages secure provider configuration storage and retrieval
 * Single Responsibility: Provider credential and configuration management
 *
 * Storage Strategy:
 * 1. Memory cache (Map) for fast access within request lifecycle
 * 2. Durable store (passed in) for cross-isolate persistence
 * 3. Fallback: Returns cached value if durable store unavailable
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
import type { DurableProviderStore } from "./providers/DurableProviderStore";

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
  private durableStore?: DurableProviderStore;

  constructor(_env: Env, durableStore?: DurableProviderStore) {
    this.configs = providerConfigStore;
    this.durableStore = durableStore;
    // Use ephemeral in-memory storage for fast access
    // Durable store (if provided) persists for cross-isolate access
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
      const now = new Date().toISOString();

      // Store in memory (ephemeral)
      this.configs.set(providerId, {
        providerId,
        apiKey,
        connectedAt: now,
      });

      // Also persist to durable store if available
      if (this.durableStore) {
        try {
          await this.durableStore.setProvider(providerId, apiKey);
          console.log(
            `[provider/config] ${providerId} connected and persisted (key masked)`,
          );
        } catch (durableError) {
          console.warn(
            `[provider/config] Failed to persist ${providerId} to durable store:`,
            durableError,
          );
          // Don't fail the request, but log the issue
        }
      } else {
        console.log(
          `[provider/config] ${providerId} connected (ephemeral, no durable store)`,
        );
      }

      return {
        status: "connected" as const,
        providerId,
        lastValidatedAt: now,
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
      const { providerId } = request;

      // Remove from memory cache
      this.configs.delete(providerId);

      // Also remove from durable store if available
      if (this.durableStore) {
        try {
          await this.durableStore.deleteProvider(providerId);
          console.log(
            `[provider/config] ${providerId} disconnected (removed from durable)`,
          );
        } catch (durableError) {
          console.warn(
            `[provider/config] Failed to remove ${providerId} from durable store:`,
            durableError,
          );
        }
      } else {
        console.log(
          `[provider/config] ${providerId} disconnected (memory only)`,
        );
      }

      return {
        status: "disconnected" as const,
        providerId,
      };
    } catch (error) {
      console.error(`[provider/config] Error disconnecting:`, error);
      throw error;
    }
  }

  /**
   * Get connection status for all providers
   */
  async getStatus(): Promise<ProviderConnectionStatus[]> {
    const supportedProviders: ProviderId[] = ["openrouter", "openai", "groq"];

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
   * Checks memory cache first, then durable store as fallback
   */
  async getApiKey(providerId: ProviderId): Promise<string | null> {
    // Check memory cache first (fast path)
    const cached = this.configs.get(providerId)?.apiKey;
    if (cached) {
      return cached;
    }

    // Fallback to durable store if available
    if (this.durableStore) {
      try {
        const key = await this.durableStore.getApiKey(providerId);
        if (key) {
          // Populate memory cache for next access
          this.configs.set(providerId, {
            providerId,
            apiKey: key,
            connectedAt: new Date().toISOString(),
          });
        }
        return key;
      } catch (e) {
        console.warn(
          `[provider/config] Failed to get API key from durable store:`,
          e,
        );
      }
    }

    return null;
  }

  /**
   * Check if provider is connected
   * Checks memory cache first, then durable store
   */
  async isConnected(providerId: ProviderId): Promise<boolean> {
    // Check memory cache first
    if (this.configs.has(providerId)) {
      return true;
    }

    // Check durable store as fallback
    if (this.durableStore) {
      try {
        return await this.durableStore.isConnected(providerId);
      } catch (e) {
        console.warn(`[provider/config] Failed to check durable store:`, e);
      }
    }

    return false;
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
