/**
 * ProviderConnectionService
 * Single Responsibility: Query provider connection status
 */

import type { ProviderId, ProviderConnectionStatus } from "../../schemas/provider";
import type { ProviderCredentialService } from "./ProviderCredentialService";
import { PROVIDER_IDS } from "./provider-registry";

/**
 * ProviderConnectionService - Queries connection status for all providers
 */
export class ProviderConnectionService {
  private credentialService: ProviderCredentialService; // Injected credential service

  constructor(credentialService: ProviderCredentialService) {
    this.credentialService = credentialService;
  }

  /**
   * Get connection status for all providers
   */
  async getStatus(): Promise<ProviderConnectionStatus[]> {
    const statuses: ProviderConnectionStatus[] = [];

    for (const providerId of PROVIDER_IDS as readonly ProviderId[]) {
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
}
