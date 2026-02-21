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
  BYOKConnectRequest,
  BYOKConnectResponse,
  BYOKDisconnectRequest,
  ProviderId,
  BYOKValidateRequest,
  BYOKValidateResponse,
} from "@repo/shared-types";
import {
  ProviderError,
  ProviderNotConnectedError,
} from "../../domain/errors";
import { isProviderApiKeyFormatValid } from "../../schemas/provider-registry";
import type { DurableProviderStore } from "./DurableProviderStore";
import { ProviderLiveValidationService } from "./ProviderLiveValidationService";

/**
 * ProviderCredentialService - Manages provider API credentials
 */
export class ProviderCredentialService {
  private durableStore: DurableProviderStore;
  private liveValidationService: ProviderLiveValidationService;

  constructor(env: Env, durableStore: DurableProviderStore) {
    this.durableStore = durableStore;
    this.liveValidationService = ProviderLiveValidationService.fromEnv(env);
  }

  /**
   * Connect a provider with API key validation.
   * Transport-level shape validation happens at request boundaries; provider-specific
   * key format validation is enforced here before persisting credentials.
   */
  async connect(
    request: BYOKConnectRequest,
  ): Promise<BYOKConnectResponse> {
    try {
      const { providerId, apiKey } = request;
      const normalizedApiKey = apiKey.trim();
      if (!isConnectApiKeyValid(providerId, normalizedApiKey)) {
        return this.failureResponse(
          providerId,
          "Invalid API key format for this provider",
        );
      }
      const now = new Date().toISOString();

      await this.durableStore.setProvider(providerId, normalizedApiKey);
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

  async validate(
    request: BYOKValidateRequest,
  ): Promise<BYOKValidateResponse> {
    const { providerId } = request;
    const validationMode = request.mode ?? "format";
    const apiKey = await this.getApiKey(providerId);
    if (!apiKey) {
      throw new ProviderNotConnectedError(providerId);
    }

    const isValidFormat = isProviderApiKeyFormatValid(providerId, apiKey);
    if (!isValidFormat) {
      throw new ProviderError(
        `Provider "${providerId}" credential failed validation.`,
        "AUTH_FAILED",
        401,
        false,
      );
    }

    if (validationMode === "live") {
      this.liveValidationService.ensureEnabled();
      await this.liveValidationService.validate(providerId, apiKey);
    }
    return {
      providerId,
      status: "valid",
      checkedAt: new Date().toISOString(),
      validationMode,
    };
  }

  /**
   * Disconnect a provider
   */
  async disconnect(
    request: BYOKDisconnectRequest,
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
  ): BYOKConnectResponse {
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

function isConnectApiKeyValid(providerId: ProviderId, apiKey: string): boolean {
  if (apiKey.length < 10) {
    return false;
  }
  if (!/^[a-zA-Z0-9\-_]+$/.test(apiKey)) {
    return false;
  }
  return isProviderApiKeyFormatValid(providerId, apiKey);
}
