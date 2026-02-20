/**
 * ProviderConfigService
 * Facade for provider configuration and credential management
 *
 * This service delegates to focused, single-responsibility services:
 * - ProviderCredentialService: Credential operations
 * - ProviderCatalogService: Model catalog queries
 * - ProviderConnectionService: Status queries
 *
 * Maintains backward compatibility while enabling gradual migration to focused services.
 */

import type { Env } from "../../types/ai";
import type {
  ProviderId,
  ConnectProviderRequest,
  ConnectProviderResponse,
  DisconnectProviderRequest,
  ProviderConnectionStatus,
  ModelsListResponse,
} from "../../schemas/provider";
import type { DurableProviderStore } from "./DurableProviderStore";
import { ProviderCredentialService } from "./ProviderCredentialService";
import { ProviderCatalogService } from "./ProviderCatalogService";
import { ProviderConnectionService } from "./ProviderConnectionService";

/**
 * ProviderConfigService - Facade delegating to focused services
 */
export class ProviderConfigService {
  private credentialService: ProviderCredentialService;
  private catalogService: ProviderCatalogService;
  private connectionService: ProviderConnectionService;

  constructor(_env: Env, durableStore: DurableProviderStore) {
    this.credentialService = new ProviderCredentialService(_env, durableStore);
    this.catalogService = new ProviderCatalogService();
    this.connectionService = new ProviderConnectionService(
      this.credentialService,
    );
  }

  /**
   * Connect a provider with API key validation
   * Delegates to ProviderCredentialService
   */
  async connect(
    request: ConnectProviderRequest,
  ): Promise<ConnectProviderResponse> {
    return this.credentialService.connect(request);
  }

  /**
   * Disconnect a provider
   * Delegates to ProviderCredentialService
   */
  async disconnect(
    request: DisconnectProviderRequest,
  ): Promise<{ status: "disconnected"; providerId: ProviderId }> {
    return this.credentialService.disconnect(request);
  }

  /**
   * Get connection status for all providers
   * Delegates to ProviderConnectionService
   */
  async getStatus(): Promise<ProviderConnectionStatus[]> {
    return this.connectionService.getStatus();
  }

  /**
   * Get available models for a provider
   * Delegates to ProviderCatalogService
   */
  async getModels(providerId: ProviderId): Promise<ModelsListResponse> {
    return this.catalogService.getModels(providerId);
  }

  /**
   * Get API key for a provider (internal use only)
   * Delegates to ProviderCredentialService
   */
  async getApiKey(providerId: ProviderId): Promise<string | null> {
    return this.credentialService.getApiKey(providerId);
  }

  /**
   * Check if provider is connected
   * Delegates to ProviderCredentialService
   */
  async isConnected(providerId: ProviderId): Promise<boolean> {
    return this.credentialService.isConnected(providerId);
  }

  /**
   * Reset provider config state for tests
   * Static method for test isolation
   */
  static resetForTests(): void {
    ProviderCredentialService.resetForTests();
  }
}
