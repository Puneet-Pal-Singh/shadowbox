/**
 * IProviderConfigService
 * Interface for provider configuration operations
 * Enables dependency injection and testing with mocks
 */

import type {
  BYOKPreferences,
  BYOKPreferencesPatch,
  BYOKValidateRequest,
  BYOKValidateResponse,
  ProviderCatalogResponse,
  ProviderConnectionsResponse,
} from "@repo/shared-types";
import type {
  ProviderId,
  ConnectProviderRequest,
  ConnectProviderResponse,
  DisconnectProviderRequest,
  ProviderConnectionStatus,
  ModelsListResponse,
} from "../../schemas/provider";

/**
 * Minimal provider config service interface
 * Exposes the public operations without implementation details
 */
export interface IProviderConfigService {
  getCatalog(): Promise<ProviderCatalogResponse>;
  getConnections(): Promise<ProviderConnectionsResponse>;
  connect(request: ConnectProviderRequest): Promise<ConnectProviderResponse>;
  validate(request: BYOKValidateRequest): Promise<BYOKValidateResponse>;
  disconnect(
    request: DisconnectProviderRequest,
  ): Promise<{ status: "disconnected"; providerId: ProviderId }>;
  updatePreferences(patch: BYOKPreferencesPatch): Promise<BYOKPreferences>;
  getStatus(): Promise<ProviderConnectionStatus[]>;
  getModels(providerId: ProviderId): Promise<ModelsListResponse>;
  getApiKey(providerId: ProviderId): Promise<string | null>;
  isConnected(providerId: ProviderId): Promise<boolean>;
}
