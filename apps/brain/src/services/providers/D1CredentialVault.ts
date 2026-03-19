/**
 * D1 Credential Vault
 *
 * Provider-neutral credential vault backed by D1 stores.
 * This is the D1 replacement for CloudCredentialVault (DO-backed).
 */

import type { CredentialVault, ProviderId } from "@repo/shared-types";
import type { CredentialStore } from "./stores/CredentialStore";

export class D1CredentialVault implements CredentialVault {
  readonly surface = "cloud" as const;

  constructor(
    private readonly credentialStore: CredentialStore,
    private readonly userId: string,
  ) {}

  async setCredential(providerId: ProviderId, apiKey: string): Promise<void> {
    await this.credentialStore.setCredential({
      credentialId: crypto.randomUUID(),
      userId: this.userId,
      providerId,
      label: "default",
      apiKey,
    });
  }

  async getApiKey(providerId: ProviderId): Promise<string | null> {
    const result = await this.credentialStore.getCredentialWithKey(providerId);
    return result?.apiKey ?? null;
  }

  async deleteCredential(providerId: ProviderId): Promise<void> {
    await this.credentialStore.deleteCredential(providerId);
  }

  async isConnected(providerId: ProviderId): Promise<boolean> {
    const cred = await this.credentialStore.getCredential(providerId);
    return cred !== null && cred.status === "connected";
  }

  async listConnectedProviders(): Promise<ProviderId[]> {
    return this.credentialStore.listCredentialProviders();
  }
}
