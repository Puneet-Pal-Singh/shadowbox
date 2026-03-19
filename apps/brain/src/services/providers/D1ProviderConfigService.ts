/**
 * D1 Provider Config Service
 *
 * D1-backed provider configuration and credential management.
 * This is the D1 replacement for ProviderConfigService (DO-backed).
 *
 * This service delegates to focused, single-responsibility services:
 * - CredentialStore: Credential operations (D1-backed)
 * - PreferenceStore: Preference operations (D1-backed)
 * - ProviderCatalogService: Model catalog queries
 * - ProviderConnectionService: Status queries
 * - ProviderAuditService: Audit logging
 * - AxisQuotaService: Quota tracking
 * - ProviderModelDiscoveryService: Model discovery
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
import type { ModelsListResponse } from "../../schemas/provider";
import type { CredentialStore } from "./stores/CredentialStore";
import type { PreferenceStore } from "./stores/PreferenceStore";
import type { ProviderModelCacheStore } from "./stores/ProviderModelCacheStore";
import { D1CredentialVault } from "./D1CredentialVault";
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
 * D1ProviderConfigService - D1-backed provider configuration
 */
export class D1ProviderConfigService {
  private credentialVault: D1CredentialVault;
  private credentialService: ProviderCredentialService;
  private registryService: ProviderRegistryService;
  private catalogService: ProviderCatalogService;
  private modelDiscoveryService: ProviderModelDiscoveryService;
  private connectionService: ProviderConnectionService;
  private auditService: ProviderAuditService;
  private axisQuotaService: AxisQuotaService;

  constructor(
    env: Env,
    credentialStore: CredentialStore,
    preferenceStore: PreferenceStore,
    modelCacheStore: ProviderModelCacheStore,
    userId: string,
    workspaceId: string,
  ) {
    this.registryService = new ProviderRegistryService();
    this.credentialVault = new D1CredentialVault(credentialStore, userId);
    this.credentialService = new ProviderCredentialService(
      env,
      this.credentialVault,
      this.registryService,
    );
    this.modelDiscoveryService = new ProviderModelDiscoveryService(
      modelCacheStore,
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
    this.auditService = new ProviderAuditService();
    this.axisQuotaService = new AxisQuotaService(
      resolveAxisDailyLimit(env.AXIS_DAILY_LIMIT),
    );
  }

  async getCatalog(): Promise<ProviderCatalogResponse> {
    return this.catalogService.getCatalog();
  }

  async getConnections(): Promise<ProviderConnectionsResponse> {
    const connections = await this.connectionService.getConnections();
    return { connections };
  }

  async connect(request: BYOKConnectRequest): Promise<BYOKConnectResponse> {
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

  async validate(request: BYOKValidateRequest): Promise<BYOKValidateResponse> {
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
    return {} as BYOKPreferences;
  }

  async updatePreferences(
    _patch: BYOKPreferencesPatch,
  ): Promise<BYOKPreferences> {
    return {} as BYOKPreferences;
  }

  async getStatus(): Promise<ProviderConnection[]> {
    return this.connectionService.getStatus();
  }

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

  async getApiKey(providerId: ProviderId): Promise<string | null> {
    return this.credentialVault.getApiKey(providerId);
  }

  async isConnected(providerId: ProviderId): Promise<boolean> {
    return this.credentialVault.isConnected(providerId);
  }

  async getAxisQuotaStatus(): Promise<AxisQuotaStatus> {
    return this.axisQuotaService.getStatus();
  }

  async consumeAxisQuota(correlationId?: string): Promise<AxisQuotaStatus> {
    return this.axisQuotaService.consume(correlationId);
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
