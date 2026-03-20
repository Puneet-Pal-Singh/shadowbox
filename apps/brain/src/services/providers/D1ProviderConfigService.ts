/**
 * D1 Provider Config Service
 *
 * D1-backed provider configuration service.
 * This is the D1 replacement for the DO-backed ProviderConfigService.
 *
 * Uses focused D1 stores instead of DurableProviderStore:
 * - CredentialStore: user-global credentials
 * - PreferenceStore: workspace-scoped preferences
 * - ProviderAuditLog: append-only audit
 * - ProviderQuotaStore: Axis quota tracking
 */

import type { D1Database } from "@cloudflare/workers-types";
import type {
  BYOKConnectRequest,
  BYOKConnectResponse,
  BYOKDisconnectRequest,
  BYOKPreferences,
  BYOKPreferencesPatch,
  BYOKValidateRequest,
  BYOKValidateResponse,
  ProviderId,
} from "@repo/shared-types";
import type { CredentialStore } from "./stores/CredentialStore";
import type { PreferenceStore } from "./stores/PreferenceStore";
import type { ProviderModelCacheStore } from "./stores/ProviderModelCacheStore";
import { ProviderRegistryService } from "./ProviderRegistryService";
import { AXIS_PROVIDER_ID, getAxisDiscoveredModels } from "./axis";
import { CredentialEncryptionService } from "../byok/encryption.js";

export interface D1ProviderConfigServiceOptions {
  db: D1Database;
  userId: string;
  workspaceId: string;
  encryptionKey: string;
  encryptionKeyVersion: string;
  previousEncryptionKey?: string;
}

export class D1ProviderConfigService {
  private credentialStore: CredentialStore;
  private preferenceStore: PreferenceStore;
  private modelCacheStore: ProviderModelCacheStore;
  private registryService: ProviderRegistryService;
  private encryption: CredentialEncryptionService;

  constructor(options: D1ProviderConfigServiceOptions) {
    this.registryService = new ProviderRegistryService();
    this.encryption = new CredentialEncryptionService();

    const {
      db,
      userId,
      encryptionKey,
      encryptionKeyVersion,
      previousEncryptionKey,
    } = options;

    this.credentialStore =
      new (require("./stores/D1CredentialStore").D1CredentialStore)(
        db,
        userId,
        encryptionKey,
        encryptionKeyVersion,
        previousEncryptionKey,
      );
    this.preferenceStore =
      new (require("./stores/D1PreferenceStore").D1PreferenceStore)(
        db,
        userId,
        options.workspaceId,
      );
    this.modelCacheStore =
      new (require("./stores/D1ProviderModelCacheStore").D1ProviderModelCacheStore)(
        db,
      );
  }

  async getCredentialStore(): Promise<CredentialStore> {
    return this.credentialStore;
  }

  async getPreferenceStore(): Promise<PreferenceStore> {
    return this.preferenceStore;
  }

  async getModelCacheStore(): Promise<ProviderModelCacheStore> {
    return this.modelCacheStore;
  }

  async getPreferences(): Promise<BYOKPreferences> {
    return this.preferenceStore.getPreferences();
  }

  async updatePreferences(
    patch: BYOKPreferencesPatch,
  ): Promise<BYOKPreferences> {
    return this.preferenceStore.updatePreferences(patch);
  }

  async isConnected(providerId: ProviderId): Promise<boolean> {
    const cred = await this.credentialStore.getCredential(providerId);
    return cred !== null && cred.status === "connected";
  }

  async getApiKey(providerId: ProviderId): Promise<string | null> {
    const result = await this.credentialStore.getCredentialWithKey(providerId);
    return result?.apiKey ?? null;
  }

  async listConnectedProviders(): Promise<ProviderId[]> {
    return this.credentialStore.listCredentialProviders();
  }

  async deleteCredential(providerId: ProviderId): Promise<void> {
    await this.credentialStore.deleteCredential(providerId);
  }

  async setCredential(
    providerId: ProviderId,
    apiKey: string,
    label: string = "default",
  ): Promise<void> {
    await this.credentialStore.setCredential({
      credentialId: crypto.randomUUID(),
      userId: "", // Will be injected by store
      providerId,
      label,
      apiKey,
    });
  }
}
