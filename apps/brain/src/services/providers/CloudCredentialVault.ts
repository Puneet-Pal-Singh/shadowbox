import type { CredentialVault, ProviderId } from "@repo/shared-types";
import type { DurableProviderStore } from "./DurableProviderStore";

/**
 * CloudCredentialVault
 * Provider-neutral credential vault backed by DurableProviderStore.
 */
export class CloudCredentialVault implements CredentialVault {
  readonly surface = "cloud" as const;

  constructor(private readonly durableStore: DurableProviderStore) {}

  async setCredential(providerId: ProviderId, apiKey: string): Promise<void> {
    await this.durableStore.setProvider(providerId, apiKey);
  }

  async getApiKey(providerId: ProviderId): Promise<string | null> {
    return this.durableStore.getApiKey(providerId);
  }

  async deleteCredential(providerId: ProviderId): Promise<void> {
    await this.durableStore.deleteProvider(providerId);
  }

  async isConnected(providerId: ProviderId): Promise<boolean> {
    return this.durableStore.isConnected(providerId);
  }

  async listConnectedProviders(): Promise<ProviderId[]> {
    return this.durableStore.getAllProviders();
  }
}
