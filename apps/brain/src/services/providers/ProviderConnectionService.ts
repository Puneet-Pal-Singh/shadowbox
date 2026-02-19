/**
 * ProviderConnectionService
 * Single Responsibility: Query provider connection status
 */

import type { ProviderId, ProviderConnectionStatus } from "../../schemas/provider";

/**
 * ProviderConnectionService - Queries connection status for all providers
 */
export class ProviderConnectionService {
  private credentialService: any; // Injected credential service

  constructor(credentialService: any) {
    this.credentialService = credentialService;
  }

  /**
   * Get connection status for all providers
   */
  async getStatus(): Promise<ProviderConnectionStatus[]> {
    const supportedProviders: ProviderId[] = ["openrouter", "openai", "groq"];

    const statuses: ProviderConnectionStatus[] = [];

    for (const providerId of supportedProviders) {
      const isConnected = await this.credentialService.isConnected(providerId);

      statuses.push({
        providerId,
        status: isConnected ? ("connected" as const) : ("disconnected" as const),
        lastValidatedAt: isConnected ? new Date().toISOString() : undefined,
      });
    }

    return statuses;
  }
}
