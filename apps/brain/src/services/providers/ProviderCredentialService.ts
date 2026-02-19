/**
 * ProviderCredentialService
 * Single Responsibility: Manage provider API credentials (connect, disconnect, isConnected, getApiKey)
 *
 * Storage Strategy:
 * 1. Memory cache (Map) for fast access within request lifecycle
 * 2. Durable store (passed in) for cross-isolate persistence
 * 3. Fallback: Returns cached value if durable store unavailable
 */

import type { Env } from "../../types/ai";
import type {
  ProviderId,
  ConnectProviderRequest,
  ConnectProviderResponse,
  DisconnectProviderRequest,
} from "../../schemas/provider";
import type { DurableProviderStore } from "./DurableProviderStore";

interface ProviderConfig {
  providerId: ProviderId;
  apiKey: string;
  connectedAt: string;
}

const providerCredentialStore: Map<ProviderId, ProviderConfig> = new Map();

/**
 * ProviderCredentialService - Manages provider API credentials
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
 */
export class ProviderCredentialService {
  private credentials: Map<ProviderId, ProviderConfig>;
  private durableStore?: DurableProviderStore;

  constructor(_env: Env, durableStore?: DurableProviderStore) {
    this.credentials = providerCredentialStore;
    this.durableStore = durableStore;
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
      this.credentials.set(providerId, {
        providerId,
        apiKey,
        connectedAt: now,
      });

      // Also persist to durable store if available
      if (this.durableStore) {
        try {
          await this.durableStore.setProvider(providerId, apiKey);
          console.log(
            `[provider/credential] ${providerId} connected and persisted (key masked)`,
          );
        } catch (durableError) {
          console.warn(
            `[provider/credential] Failed to persist ${providerId} to durable store:`,
            durableError,
          );
          // Don't fail the request, but log the issue
        }
      } else {
        console.log(
          `[provider/credential] ${providerId} connected (ephemeral, no durable store)`,
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
      console.error(
        `[provider/credential] Error connecting ${providerId}:`,
        error,
      );

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
      this.credentials.delete(providerId);

      // Also remove from durable store if available
      if (this.durableStore) {
        try {
          await this.durableStore.deleteProvider(providerId);
          console.log(
            `[provider/credential] ${providerId} disconnected (removed from durable)`,
          );
        } catch (durableError) {
          console.warn(
            `[provider/credential] Failed to remove ${providerId} from durable store:`,
            durableError,
          );
        }
      } else {
        console.log(
          `[provider/credential] ${providerId} disconnected (memory only)`,
        );
      }

      return {
        status: "disconnected" as const,
        providerId,
      };
    } catch (error) {
      console.error(`[provider/credential] Error disconnecting:`, error);
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
    const cached = this.credentials.get(providerId)?.apiKey;
    if (cached) {
      return cached;
    }

    // Fallback to durable store if available
    if (this.durableStore) {
      try {
        const key = await this.durableStore.getApiKey(providerId);
        if (key) {
          // Populate memory cache for next access
          this.credentials.set(providerId, {
            providerId,
            apiKey: key,
            connectedAt: new Date().toISOString(),
          });
        }
        return key;
      } catch (e) {
        console.warn(
          `[provider/credential] Failed to get API key from durable store:`,
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
    if (this.credentials.has(providerId)) {
      return true;
    }

    // Check durable store as fallback
    if (this.durableStore) {
      try {
        return await this.durableStore.isConnected(providerId);
      } catch (e) {
        console.warn(
          `[provider/credential] Failed to check durable store:`,
          e,
        );
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
   * Reset provider credentials for tests
   * Static method for test isolation
   * ⚠️ SECURITY: Only available in test environments
   * @throws Error if called in production environments
   */
  static resetForTests(): void {
    if (process.env.NODE_ENV !== "test") {
      throw new Error(
        "ProviderCredentialService.resetForTests() is only available in test environments. " +
          "This prevents accidental credential wipe in production.",
      );
    }
    providerCredentialStore.clear();
  }
}
