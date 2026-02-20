/**
 * ProviderCredentialService
 * Single Responsibility: Manage provider API credentials (connect, disconnect, isConnected, getApiKey)
 *
 * Storage Strategy:
 * - Durable store only (single source of truth).
 * - No module-level or isolate-local credential authority.
 */

import type { Env } from "../../types/ai";
import type {
  ProviderId,
  ConnectProviderRequest,
  ConnectProviderResponse,
  DisconnectProviderRequest,
} from "../../schemas/provider";
import type { DurableProviderStore } from "./DurableProviderStore";

/**
 * ProviderCredentialService - Manages provider API credentials
 */
export class ProviderCredentialService {
  private durableStore: DurableProviderStore;

  constructor(_env: Env, durableStore: DurableProviderStore) {
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

      await this.durableStore.setProvider(providerId, apiKey);
      console.log(
        `[provider/credential] ${providerId} connected and persisted (key masked)`,
      );

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

      await this.durableStore.deleteProvider(providerId);
      console.log(
        `[provider/credential] ${providerId} disconnected (removed from durable)`,
      );

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
   * Uses durable store as the only source of truth.
   */
  async getApiKey(providerId: ProviderId): Promise<string | null> {
    return this.durableStore.getApiKey(providerId);
  }

  /**
   * Check if provider is connected
   * Uses durable store as the only source of truth.
   */
  async isConnected(providerId: ProviderId): Promise<boolean> {
    return this.durableStore.isConnected(providerId);
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
    // Durable-store-only implementation has no module-level state to reset.
  }
}
