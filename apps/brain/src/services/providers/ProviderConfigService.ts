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
  BYOKConnectRequest,
  BYOKConnectResponse,
  BYOKDisconnectRequest,
  BYOKPreferences,
  BYOKPreferencesPatch,
  BYOKValidateRequest,
  BYOKValidateResponse,
  ProviderCatalogResponse,
  ProviderConnection,
  ProviderConnectionsResponse,
  ProviderId,
} from "@repo/shared-types";
import type {
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
  private durableStore: DurableProviderStore;
  private credentialService: ProviderCredentialService;
  private catalogService: ProviderCatalogService;
  private connectionService: ProviderConnectionService;

  constructor(_env: Env, durableStore: DurableProviderStore) {
    this.durableStore = durableStore;
    this.credentialService = new ProviderCredentialService(_env, durableStore);
    this.catalogService = new ProviderCatalogService();
    this.connectionService = new ProviderConnectionService(
      this.credentialService,
    );
  }

  async getCatalog(): Promise<ProviderCatalogResponse> {
    return this.catalogService.getCatalog();
  }

  async getConnections(): Promise<ProviderConnectionsResponse> {
    const connections = await this.connectionService.getConnections();
    return { connections };
  }

  /**
   * Connect a provider with API key validation
   * Delegates to ProviderCredentialService
   */
  async connect(
    request: BYOKConnectRequest,
  ): Promise<BYOKConnectResponse> {
    return this.credentialService.connect(request);
  }

  async validate(
    request: BYOKValidateRequest,
  ): Promise<BYOKValidateResponse> {
    return this.credentialService.validate(request);
  }

  /**
   * Disconnect a provider
   * Delegates to ProviderCredentialService
   */
  async disconnect(
    request: BYOKDisconnectRequest,
  ): Promise<{ status: "disconnected"; providerId: ProviderId }> {
    return this.credentialService.disconnect(request);
  }

  async updatePreferences(
    patch: BYOKPreferencesPatch,
  ): Promise<BYOKPreferences> {
    return this.durableStore.updatePreferences(patch);
  }

  /**
   * Get connection status for all providers
   * Delegates to ProviderConnectionService
   */
  async getStatus(): Promise<ProviderConnection[]> {
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
