/**
 * DurableProviderStore
 * Persists provider credentials in Durable Object storage for cross-isolate access
 *
 * Problem: ProviderConfigService was isolate-local (ephemeral)
 * Solution: Store provider state in Durable Objects so RunEngine can access it
 *
 * Design:
 * - Stores encrypted provider credentials in Durable Object
 * - Exposes get/set/delete methods for provider state
 * - Provides atomic operations with transactional guarantees
 */

import type { DurableObjectState } from "@cloudflare/workers-types";
import {
  decryptToken,
  encryptToken,
  type EncryptedToken,
} from "@shadowbox/github-bridge";
import {
  ProviderIdSchema,
  type BYOKValidationMode,
  type BYOKPreferences,
  type BYOKPreferencesPatch,
  type ProviderId,
} from "@repo/shared-types";
import {
  normalizeProviderScope,
  sanitizeScopeSegment,
  type ProviderStoreScopeInput,
} from "./provider-scope";
import type { ProviderEncryptionConfig } from "./provider-encryption-key";

export interface ProviderCredential {
  providerId: ProviderId;
  apiKey: string;
  connectedAt: string;
}

interface ProviderCredentialRecordV2 {
  version: "v2";
  providerId: ProviderId;
  encryptedApiKey: EncryptedToken;
  keyVersion?: string;
  keyFingerprint: string;
  connectedAt: string;
  userId: string;
  workspaceId: string;
}

interface LegacyProviderCredentialRecord {
  providerId: ProviderId;
  apiKey: string;
  connectedAt?: string;
}

interface ProviderAuditRecordV1 {
  version: "v1";
  eventType: string;
  status: "success" | "failure";
  providerId?: ProviderId;
  validationMode?: BYOKValidationMode;
  message?: string;
  createdAt: string;
}

interface ProviderPreferencesRecordV1 {
  version: "v1";
  defaultProviderId?: ProviderId;
  defaultModelId?: string;
  updatedAt: string;
}

const PROVIDER_STORE_V2_PREFIX = "provider:v2:";
const PROVIDER_STORE_LEGACY_PREFIX = "provider:";
const PROVIDER_PREFERENCES_SUFFIX = "_preferences";
const PROVIDER_AUDIT_PREFIX = "provider:audit:v1:";

export interface LegacyCredentialMigrationConfig {
  legacyReadFallbackEnabled: boolean;
  legacyBackfillEnabled: boolean;
  legacyRollbackEnabled: boolean;
  legacyCutoffAt?: string;
}

export interface ProviderAuditEvent {
  eventType: string;
  status: "success" | "failure";
  providerId?: ProviderId;
  validationMode?: BYOKValidationMode;
  message?: string;
  createdAt: string;
}

export class DurableProviderStore {
  private readonly scope;
  private readonly encryptionConfig: ProviderEncryptionConfig;
  private readonly migrationConfig: LegacyCredentialMigrationConfig;

  constructor(
    private state: DurableObjectState,
    scopeInput: ProviderStoreScopeInput,
    encryption: string | ProviderEncryptionConfig,
    migrationConfig: LegacyCredentialMigrationConfig = defaultMigrationConfig(),
  ) {
    this.scope = normalizeProviderScope(scopeInput);
    this.encryptionConfig = normalizeEncryptionConfig(encryption);
    this.migrationConfig = migrationConfig;
  }

  /**
   * Store a provider credential
   * Single storage write is atomic in Durable Object storage.
   * Plaintext API keys are never persisted.
   */
  async setProvider(
    providerId: ProviderId,
    apiKey: string,
  ): Promise<void> {
    await this.storeScopedCredential(providerId, apiKey, new Date().toISOString());
    console.log(
      `[provider/durable] Stored encrypted credential for ${providerId} (scope=${this.scope.userId}/${this.scope.workspaceId})`,
    );
  }

  /**
   * Get a provider credential
   * Returns null if not found.
   * Legacy run-scoped keys are intentionally unsupported after BYOK cutover.
   */
  async getProvider(providerId: ProviderId): Promise<ProviderCredential | null> {
    const scopedData = await this.readScopedProviderRaw(providerId);
    const scopedCredential = await this.parseScopedCredential(
      providerId,
      scopedData,
    );
    if (scopedCredential) {
      return scopedCredential;
    }

    return await this.getLegacyCredentialWithControls(providerId);
  }

  private async readScopedProviderRaw(providerId: ProviderId): Promise<unknown> {
    try {
      return await this.state.storage?.get(this.getScopedKey(providerId));
    } catch (error) {
      console.error(
        `[provider/durable] Failed to read scoped credential for ${providerId}:`,
        error,
      );
      return undefined;
    }
  }

  /**
   * Get API key for a provider
   * Returns null if provider not connected
   */
  async getApiKey(providerId: ProviderId): Promise<string | null> {
    const credential = await this.getProvider(providerId);
    return credential?.apiKey ?? null;
  }

  /**
   * Check if provider is connected
   */
  async isConnected(providerId: ProviderId): Promise<boolean> {
    const credential = await this.getProvider(providerId);
    return credential !== null;
  }

  /**
   * Delete a provider credential
   */
  async deleteProvider(providerId: ProviderId): Promise<void> {
    await this.state.storage?.delete(this.getScopedKey(providerId));
    await this.state.storage?.delete(this.getLegacyKey(providerId));
    console.log(`[provider/durable] Deleted credential for ${providerId}`);
  }

  /**
   * Get all connected providers
   */
  async getAllProviders(): Promise<ProviderId[]> {
    const scopedPrefix = this.getScopedPrefix();
    const entries = await this.state.storage?.list({ prefix: scopedPrefix });

    const providerIds = new Set<ProviderId>();
    for (const key of entries?.keys() ?? []) {
      const providerId = key.substring(scopedPrefix.length);
      const parseResult = ProviderIdSchema.safeParse(providerId);
      if (parseResult.success) {
        providerIds.add(parseResult.data);
      }
    }

    return Array.from(providerIds);
  }

  async getPreferences(): Promise<BYOKPreferences> {
    const fallback = this.createDefaultPreferences();
    const raw = await this.state.storage?.get(this.getPreferencesKey());
    if (typeof raw !== "string") {
      return fallback;
    }

    try {
      const parsed = JSON.parse(raw) as ProviderPreferencesRecordV1;
      return {
        defaultProviderId: parsed.defaultProviderId,
        defaultModelId: parsed.defaultModelId,
        updatedAt: parsed.updatedAt,
      };
    } catch (error) {
      console.error("[provider/durable] Failed to parse provider preferences", error);
      return fallback;
    }
  }

  async updatePreferences(
    patch: BYOKPreferencesPatch,
  ): Promise<BYOKPreferences> {
    const current = await this.getPreferences();
    const merged: BYOKPreferences = {
      defaultProviderId: patch.defaultProviderId ?? current.defaultProviderId,
      defaultModelId: patch.defaultModelId ?? current.defaultModelId,
      updatedAt: new Date().toISOString(),
    };

    const record: ProviderPreferencesRecordV1 = {
      version: "v1",
      defaultProviderId: merged.defaultProviderId,
      defaultModelId: merged.defaultModelId,
      updatedAt: merged.updatedAt,
    };

    await this.state.storage?.put(
      this.getPreferencesKey(),
      JSON.stringify(record),
    );

    return merged;
  }

  async appendAuditEvent(event: ProviderAuditEvent): Promise<void> {
    const key = this.getAuditEventKey();
    const record: ProviderAuditRecordV1 = {
      version: "v1",
      ...event,
    };
    await this.state.storage?.put(key, JSON.stringify(record));
  }

  /**
   * Clear all provider credentials
   * ⚠️ DANGEROUS: Only use in testing
   */
  async clearAll(): Promise<void> {
    if (!isTestEnvironment()) {
      throw new Error(
        "clearAll() is only available in test environments",
      );
    }

    await this.deleteEntriesByPrefix(this.getScopedPrefix());
    await this.deleteEntriesByPrefix(this.getLegacyPrefix());
    await this.deleteEntriesByPrefix(this.getAuditPrefix());

    console.log("[provider/durable] Cleared all credentials (test only)");
  }

  private async parseScopedCredential(
    providerId: ProviderId,
    data: unknown,
  ): Promise<ProviderCredential | null> {
    if (!data || typeof data !== "string") {
      return null;
    }

    try {
      const record = JSON.parse(data) as ProviderCredentialRecordV2;
      if (!record.encryptedApiKey) {
        return null;
      }
      const decrypted = await this.decryptCredential(providerId, record);
      if (!decrypted) {
        return null;
      }
      return {
        providerId,
        apiKey: decrypted.apiKey,
        connectedAt: record.connectedAt,
      };
    } catch (e) {
      console.error(
        `[provider/durable] Failed to read scoped credential for ${providerId}:`,
        e,
      );
      return null;
    }
  }

  private async decryptCredential(
    providerId: ProviderId,
    record: ProviderCredentialRecordV2,
  ): Promise<{ apiKey: string; keyVersion: string } | null> {
    const keyCandidates = this.getDecryptionKeyCandidates(record.keyVersion);
    for (const candidate of keyCandidates) {
      try {
        const apiKey = await decryptToken(record.encryptedApiKey, candidate.key);
        if (candidate.version !== this.encryptionConfig.current.version) {
          await this.reEncryptCredential(providerId, apiKey, record.connectedAt);
        }
        return { apiKey, keyVersion: candidate.version };
      } catch {
        // Continue through candidate keys during rotation window.
      }
    }
    return null;
  }

  private getDecryptionKeyCandidates(keyVersion?: string): Array<{
    version: string;
    key: string;
  }> {
    const current = this.encryptionConfig.current;
    const previous = this.encryptionConfig.previous;
    if (!keyVersion || keyVersion === current.version) {
      return [current];
    }
    if (previous && keyVersion === previous.version) {
      return [previous, current];
    }
    return previous ? [current, previous] : [current];
  }

  private async reEncryptCredential(
    providerId: ProviderId,
    apiKey: string,
    connectedAt: string,
  ): Promise<void> {
    try {
      await this.storeScopedCredential(providerId, apiKey, connectedAt);
      console.log(
        `[provider/durable] Re-encrypted credential for ${providerId} to keyVersion=${this.encryptionConfig.current.version}`,
      );
    } catch (error) {
      console.error(
        `[provider/durable] Failed to re-encrypt credential for ${providerId}:`,
        error,
      );
    }
  }

  private async getLegacyCredentialWithControls(
    providerId: ProviderId,
  ): Promise<ProviderCredential | null> {
    const legacy = await this.readLegacyCredential(providerId);
    if (!legacy) {
      return null;
    }
    if (!this.isLegacyReadAllowed()) {
      this.logLegacyCredentialCutoff(providerId);
      return null;
    }

    console.warn(
      `[provider/durable] Legacy run-scoped credential fallback used for ${providerId}.`,
    );
    if (this.migrationConfig.legacyBackfillEnabled) {
      await this.reEncryptCredential(
        providerId,
        legacy.apiKey,
        legacy.connectedAt ?? new Date().toISOString(),
      );
    }
    return {
      providerId,
      apiKey: legacy.apiKey,
      connectedAt: legacy.connectedAt ?? new Date().toISOString(),
    };
  }

  private async readLegacyCredential(
    providerId: ProviderId,
  ): Promise<LegacyProviderCredentialRecord | null> {
    try {
      const legacyKey = this.getLegacyKey(providerId);
      const legacyData = await this.state.storage?.get(legacyKey);
      if (typeof legacyData !== "string") {
        return null;
      }
      const parsed = JSON.parse(legacyData) as LegacyProviderCredentialRecord;
      if (typeof parsed.apiKey !== "string" || parsed.apiKey.length === 0) {
        return null;
      }
      return parsed;
    } catch (error) {
      console.error(
        `[provider/durable] Failed to inspect legacy credential for ${providerId}:`,
        error,
      );
      return null;
    }
  }

  private isLegacyReadAllowed(): boolean {
    if (this.migrationConfig.legacyRollbackEnabled) {
      return true;
    }
    if (!this.migrationConfig.legacyReadFallbackEnabled) {
      return false;
    }
    if (!this.migrationConfig.legacyCutoffAt) {
      return true;
    }

    const cutoffAt = Date.parse(this.migrationConfig.legacyCutoffAt);
    if (Number.isNaN(cutoffAt)) {
      return true;
    }
    return Date.now() < cutoffAt;
  }

  private logLegacyCredentialCutoff(providerId: ProviderId): void {
    console.warn(
      `[provider/durable] Legacy run-scoped credential detected for ${providerId}; fallback disabled or cutoff reached.`,
    );
  }

  private getScopedPrefix(): string {
    return `${PROVIDER_STORE_V2_PREFIX}${sanitizeScopeSegment(this.scope.userId)}:${sanitizeScopeSegment(this.scope.workspaceId)}:`;
  }

  private async storeScopedCredential(
    providerId: ProviderId,
    apiKey: string,
    connectedAt: string,
  ): Promise<void> {
    const encryptedApiKey = await encryptToken(
      apiKey,
      this.encryptionConfig.current.key,
    );
    const credential: ProviderCredentialRecordV2 = {
      version: "v2",
      providerId,
      encryptedApiKey,
      keyVersion: this.encryptionConfig.current.version,
      keyFingerprint: createKeyFingerprint(apiKey),
      connectedAt,
      userId: this.scope.userId,
      workspaceId: this.scope.workspaceId,
    };
    await this.state.storage?.put(
      this.getScopedKey(providerId),
      JSON.stringify(credential),
    );
  }

  private getScopedKey(providerId: ProviderId): string {
    return `${this.getScopedPrefix()}${providerId}`;
  }

  private getPreferencesKey(): string {
    return `${this.getScopedPrefix()}${PROVIDER_PREFERENCES_SUFFIX}`;
  }

  private getLegacyPrefix(): string {
    return `${PROVIDER_STORE_LEGACY_PREFIX}${this.scope.runId}:`;
  }

  private getLegacyKey(providerId: ProviderId): string {
    return `${this.getLegacyPrefix()}${providerId}`;
  }

  private getAuditPrefix(): string {
    const user = sanitizeScopeSegment(this.scope.userId);
    const workspace = sanitizeScopeSegment(this.scope.workspaceId);
    return `${PROVIDER_AUDIT_PREFIX}${user}:${workspace}:`;
  }

  private getAuditEventKey(): string {
    return `${this.getAuditPrefix()}${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  }

  private async deleteEntriesByPrefix(prefix: string): Promise<void> {
    const entries = await this.state.storage?.list({ prefix });
    if (!entries) {
      return;
    }
    for (const key of entries.keys()) {
      await this.state.storage?.delete(key);
    }
  }

  private createDefaultPreferences(): BYOKPreferences {
    return {
      updatedAt: new Date().toISOString(),
    };
  }
}

function normalizeEncryptionConfig(
  encryption: string | ProviderEncryptionConfig,
): ProviderEncryptionConfig {
  if (typeof encryption === "string") {
    return {
      current: {
        version: "v1",
        key: encryption,
      },
    };
  }
  return encryption;
}

function defaultMigrationConfig(): LegacyCredentialMigrationConfig {
  return {
    legacyReadFallbackEnabled: false,
    legacyBackfillEnabled: true,
    legacyRollbackEnabled: false,
  };
}

function createKeyFingerprint(apiKey: string): string {
  if (apiKey.length <= 8) {
    return "****";
  }

  const prefixMatch = apiKey.match(/^([A-Za-z]{2,8}[-_])/);
  const prefix = prefixMatch?.[1] ?? "";
  const suffix = apiKey.slice(-4);
  return prefix.length > 0 ? `${prefix}****${suffix}` : `****${suffix}`;
}

function isTestEnvironment(): boolean {
  const processRef = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
    __TEST_MODE__?: boolean;
  };

  const nodeEnv = processRef.process?.env?.NODE_ENV;
  const vitest = processRef.process?.env?.VITEST;
  return (
    nodeEnv === "test" ||
    vitest === "true" ||
    processRef.__TEST_MODE__ === true
  );
}
