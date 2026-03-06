/**
 * ProviderConnectionService
 * Single Responsibility: Query provider connection status
 */

import type {
  ProviderConnection,
} from "@repo/shared-types";
import type { ProviderCredentialService } from "./ProviderCredentialService";
import { ProviderRegistryService } from "./ProviderRegistryService";

/**
 * ProviderConnectionService - Queries connection status for all providers
 */
export class ProviderConnectionService {
  private credentialService: ProviderCredentialService; // Injected credential service
  private readonly registryService: ProviderRegistryService;

  constructor(
    credentialService: ProviderCredentialService,
    registryService: ProviderRegistryService,
  ) {
    this.credentialService = credentialService;
    this.registryService = registryService;
  }

  /**
   * Get connection status for all providers
   */
  async getStatus(): Promise<ProviderConnection[]> {
    const statuses: ProviderConnection[] = [];

    for (const providerId of this.registryService.listProviderIds()) {
      const isConnected = await this.credentialService.isConnected(providerId);

      statuses.push({
        providerId,
        status: isConnected ? ("connected" as const) : ("disconnected" as const),
        // Note: lastValidatedAt is read from credential store (connectedAt), not the query time
        // For now, timestamp is set when status is queried. TODO: Store credential timestamp and read from cache.
        lastValidatedAt: isConnected ? new Date().toISOString() : undefined,
      });
    }

    return statuses;
  }

  async getConnections(): Promise<ProviderConnection[]> {
    const connections: ProviderConnection[] = [];

    for (const providerId of this.registryService.listProviderIds()) {
      const isConnected = await this.credentialService.isConnected(providerId);
      const capabilities = this.registryService.getProviderCapabilities(providerId);

      connections.push({
        providerId,
        status: isConnected ? "connected" : "disconnected",
        lastValidatedAt: isConnected ? new Date().toISOString() : undefined,
        capabilities,
      });
    }

    return connections;
  }
}
