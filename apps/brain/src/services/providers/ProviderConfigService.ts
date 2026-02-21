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
import { ProviderAuditService } from "./ProviderAuditService";

/**
 * ProviderConfigService - Facade delegating to focused services
 */
export class ProviderConfigService {
  private durableStore: DurableProviderStore;
  private credentialService: ProviderCredentialService;
  private catalogService: ProviderCatalogService;
  private connectionService: ProviderConnectionService;
  private auditService: ProviderAuditService;

  constructor(_env: Env, durableStore: DurableProviderStore) {
    this.durableStore = durableStore;
    this.credentialService = new ProviderCredentialService(_env, durableStore);
    this.catalogService = new ProviderCatalogService();
    this.connectionService = new ProviderConnectionService(
      this.credentialService,
    );
    this.auditService = new ProviderAuditService(this.durableStore);
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
        status: "success",
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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}
