/**
 * ProviderConnectionService
 * Single Responsibility: Query provider connection status
 */

import type {
  ProviderConnection,
  ProviderId,
} from "@repo/shared-types";
import type { ProviderConnectionStatus } from "../../schemas/provider";
import { PROVIDER_IDS } from "../../schemas/provider-registry";
import type { ProviderCredentialService } from "./ProviderCredentialService";
import { getProviderCapabilityFlags } from "./provider-capability-matrix";

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

  async getConnections(): Promise<ProviderConnection[]> {
    const connections: ProviderConnection[] = [];

    for (const providerId of PROVIDER_IDS as readonly ProviderId[]) {
      const isConnected = await this.credentialService.isConnected(providerId);

      connections.push({
        providerId,
        status: isConnected ? "connected" : "disconnected",
        lastValidatedAt: isConnected ? new Date().toISOString() : undefined,
        capabilities: getProviderCapabilityFlags(providerId),
      });
    }

    return connections;
  }
}
