/**
 * IProviderConfigService
 * Interface for provider configuration operations
 * Enables dependency injection and testing with mocks
 */

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

/**
 * Minimal provider config service interface
 * Exposes the public operations without implementation details
 */
export interface IProviderConfigService {
  getCatalog(): Promise<ProviderCatalogResponse>;
  getConnections(): Promise<ProviderConnectionsResponse>;
  connect(request: BYOKConnectRequest): Promise<BYOKConnectResponse>;
  validate(request: BYOKValidateRequest): Promise<BYOKValidateResponse>;
  disconnect(
    request: BYOKDisconnectRequest,
  ): Promise<{ status: "disconnected"; providerId: ProviderId }>;
  updatePreferences(patch: BYOKPreferencesPatch): Promise<BYOKPreferences>;
  getStatus(): Promise<ProviderConnection[]>;
  getModels(providerId: ProviderId): Promise<ModelsListResponse>;
  getApiKey(providerId: ProviderId): Promise<string | null>;
  isConnected(providerId: ProviderId): Promise<boolean>;
}
