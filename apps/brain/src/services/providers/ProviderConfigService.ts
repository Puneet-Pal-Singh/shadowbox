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
  BYOKDiscoveredProviderModelsQuery,
  BYOKDiscoveredProviderModelsRefreshResponse,
  BYOKDiscoveredProviderModelsResponse,
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
import { CloudCredentialVault } from "./CloudCredentialVault";
import { ProviderCredentialService } from "./ProviderCredentialService";
import { ProviderCatalogService } from "./ProviderCatalogService";
import { ProviderConnectionService } from "./ProviderConnectionService";
import { ProviderAuditService } from "./ProviderAuditService";
import { AxisQuotaService, type AxisQuotaStatus } from "./AxisQuotaService";
import { ProviderModelDiscoveryService } from "./model-discovery";
import { ProviderRegistryService } from "./ProviderRegistryService";
import {
  AXIS_DAILY_LIMIT,
  AXIS_PROVIDER_ID,
  getAxisDiscoveredModels,
} from "./axis";

/**
 * ProviderConfigService - Facade delegating to focused services
 */
export class ProviderConfigService {
  private durableStore: DurableProviderStore;
  private credentialService: ProviderCredentialService;
  private registryService: ProviderRegistryService;
  private catalogService: ProviderCatalogService;
  private modelDiscoveryService: ProviderModelDiscoveryService;
  private connectionService: ProviderConnectionService;
  private auditService: ProviderAuditService;
  private axisQuotaService: AxisQuotaService;

  constructor(_env: Env, durableStore: DurableProviderStore) {
    this.durableStore = durableStore;
    this.registryService = new ProviderRegistryService();
    const credentialVault = new CloudCredentialVault(durableStore);
    this.credentialService = new ProviderCredentialService(
      _env,
      credentialVault,
      this.registryService,
    );
    this.modelDiscoveryService = new ProviderModelDiscoveryService(
      this.durableStore,
      this.credentialService,
      this.registryService,
    );
    this.catalogService = new ProviderCatalogService(
      this.registryService,
      this.modelDiscoveryService,
    );
    this.connectionService = new ProviderConnectionService(
      this.credentialService,
      this.registryService,
    );
    this.auditService = new ProviderAuditService(this.durableStore);
    this.axisQuotaService = new AxisQuotaService(
      this.durableStore,
      resolveAxisDailyLimit(_env.AXIS_DAILY_LIMIT),
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
    try {
      const response = await this.credentialService.connect(request);
      await this.auditService.record({
        eventType: "connect",
        status: response.status === "connected" ? "success" : "failure",
        providerId: request.providerId,
        message: response.errorMessage,
      });
      return response;
    } catch (error) {
      await this.auditService.record({
        eventType: "connect",
        status: "failure",
        providerId: request.providerId,
        message: toErrorMessage(error),
      });
      throw error;
    }
  }

  async validate(
    request: BYOKValidateRequest,
  ): Promise<BYOKValidateResponse> {
    try {
      const response = await this.credentialService.validate(request);
      await this.auditService.record({
        eventType: "validate",
        status: response.status === "valid" ? "success" : "failure",
        providerId: request.providerId,
        validationMode: response.validationMode,
      });
      return response;
    } catch (error) {
      await this.auditService.record({
        eventType: "validate",
        status: "failure",
        providerId: request.providerId,
        validationMode: request.mode,
        message: toErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Disconnect a provider
   * Delegates to ProviderCredentialService
   */
  async disconnect(
    request: BYOKDisconnectRequest,
  ): Promise<{ status: "disconnected"; providerId: ProviderId }> {
    try {
      const response = await this.credentialService.disconnect(request);
      await this.auditService.record({
        eventType: "disconnect",
        status: "success",
        providerId: request.providerId,
      });
      return response;
    } catch (error) {
      await this.auditService.record({
        eventType: "disconnect",
        status: "failure",
        providerId: request.providerId,
        message: toErrorMessage(error),
      });
      throw error;
    }
  }

  async getPreferences(): Promise<BYOKPreferences> {
    return this.durableStore.getPreferences();
  }

  async updatePreferences(
    patch: BYOKPreferencesPatch,
  ): Promise<BYOKPreferences> {
    try {
      const response = await this.durableStore.updatePreferences(patch);
      await this.auditService.record({
        eventType: "preferences",
        status: "success",
        providerId: patch.defaultProviderId,
      });
      return response;
    } catch (error) {
      await this.auditService.record({
        eventType: "preferences",
        status: "failure",
        providerId: patch.defaultProviderId,
        message: toErrorMessage(error),
      });
      throw error;
    }
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
    return this.catalogService.getDiscoveredModels(providerId);
  }

  async getDiscoveredModels(
    providerId: ProviderId,
    query: BYOKDiscoveredProviderModelsQuery,
  ): Promise<BYOKDiscoveredProviderModelsResponse> {
    if (providerId === AXIS_PROVIDER_ID) {
      return this.catalogService.getStaticDiscoveredModelsForAxis(query);
    }
    return this.modelDiscoveryService.getDiscoveredModels(providerId, query);
  }

  async refreshDiscoveredModels(
    providerId: ProviderId,
  ): Promise<BYOKDiscoveredProviderModelsRefreshResponse> {
    if (providerId === AXIS_PROVIDER_ID) {
      return {
        providerId: AXIS_PROVIDER_ID,
        refreshedAt: new Date().toISOString(),
        source: "provider_api",
        cacheInvalidated: false,
        modelsCount: getAxisDiscoveredModels().length,
      };
    }
    return this.modelDiscoveryService.refreshDiscoveredModels(providerId);
  }

  async getOpenRouterDiscoveredModels(
    query: BYOKDiscoveredProviderModelsQuery,
  ): Promise<BYOKDiscoveredProviderModelsResponse> {
    return this.getDiscoveredModels("openrouter", query);
  }

  async refreshOpenRouterDiscoveredModels(): Promise<BYOKDiscoveredProviderModelsRefreshResponse> {
    return this.refreshDiscoveredModels("openrouter");
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

  async getAxisQuotaStatus(): Promise<AxisQuotaStatus> {
    return this.axisQuotaService.getStatus();
  }

  async consumeAxisQuota(correlationId?: string): Promise<AxisQuotaStatus> {
    return this.axisQuotaService.consume(correlationId);
  }

  /**
   * Reset provider config state for tests
   * Static method for test isolation
   */
  static resetForTests(): void {
    ProviderCredentialService.resetForTests();
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function resolveAxisDailyLimit(rawLimit: string | undefined): number {
  if (!rawLimit) {
    return AXIS_DAILY_LIMIT;
  }

  const parsedLimit = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
    console.warn(
      `[provider/axis-quota] Invalid AXIS_DAILY_LIMIT="${rawLimit}". Using default ${AXIS_DAILY_LIMIT}.`,
    );
    return AXIS_DAILY_LIMIT;
  }

  return parsedLimit;
}
