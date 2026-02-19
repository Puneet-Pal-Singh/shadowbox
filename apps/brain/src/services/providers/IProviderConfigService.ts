/**
 * IProviderConfigService
 * Interface for provider configuration operations
 * Enables dependency injection and testing with mocks
 */

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
  connect(request: ConnectProviderRequest): Promise<ConnectProviderResponse>;
  disconnect(
    request: DisconnectProviderRequest,
  ): Promise<{ status: "disconnected"; providerId: ProviderId }>;
  getStatus(): Promise<ProviderConnectionStatus[]>;
  getModels(providerId: ProviderId): Promise<ModelsListResponse>;
  getApiKey(providerId: ProviderId): Promise<string | null>;
  isConnected(providerId: ProviderId): Promise<boolean>;
}
