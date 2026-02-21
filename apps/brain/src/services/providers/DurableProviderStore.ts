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
import type { ProviderId } from "../../schemas/provider";
import {
  normalizeProviderScope,
  sanitizeScopeSegment,
  type ProviderStoreScopeInput,
} from "./provider-scope";

export interface ProviderCredential {
  providerId: ProviderId;
  apiKey: string;
  connectedAt: string;
}

interface ProviderCredentialRecordV2 {
  version: "v2";
  providerId: ProviderId;
  encryptedApiKey: EncryptedToken;
  keyFingerprint: string;
  connectedAt: string;
  userId: string;
  workspaceId: string;
}

interface ProviderCredentialRecordV1 {
  providerId: ProviderId;
  apiKey: string;
  connectedAt: string;
}

const PROVIDER_STORE_V2_PREFIX = "provider:v2:";
const PROVIDER_STORE_LEGACY_PREFIX = "provider:";
const PROVIDER_MIGRATION_METRIC_KEY =
  "provider:migration:legacy_fallback_reads";

export class DurableProviderStore {
  private readonly scope;

  constructor(
    private state: DurableObjectState,
    scopeInput: ProviderStoreScopeInput,
    private encryptionKey: string,
  ) {
    this.scope = normalizeProviderScope(scopeInput);
  }

  /**
   * Store a provider credential
   * Uses transactional write to ensure atomicity.
   * Plaintext API keys are never persisted.
   */
  async setProvider(
    providerId: ProviderId,
    apiKey: string,
  ): Promise<void> {
    const encryptedApiKey = await encryptToken(apiKey, this.encryptionKey);
    const key = this.getScopedKey(providerId);
    const credential: ProviderCredentialRecordV2 = {
      version: "v2",
      providerId,
      encryptedApiKey,
      keyFingerprint: createKeyFingerprint(apiKey),
      connectedAt: new Date().toISOString(),
      userId: this.scope.userId,
      workspaceId: this.scope.workspaceId,
    };

    await this.state.storage?.put(key, JSON.stringify(credential));
    console.log(
      `[provider/durable] Stored encrypted credential for ${providerId} (scope=${this.scope.userId}/${this.scope.workspaceId})`,
    );
  }

  /**
   * Get a provider credential
   * Returns null if not found.
   * Performs dual-read migration:
   * 1. scoped v2 key
   * 2. legacy run-scoped key (with migration to v2)
   */
  async getProvider(providerId: ProviderId): Promise<ProviderCredential | null> {
    const scopedData = await this.state.storage?.get(this.getScopedKey(providerId));
    const scopedCredential = await this.parseScopedCredential(
      providerId,
      scopedData,
    );
    if (scopedCredential) {
      return scopedCredential;
    }

    const legacyData = await this.state.storage?.get(this.getLegacyKey(providerId));
    const legacyCredential = this.parseLegacyCredential(providerId, legacyData);
    if (!legacyCredential) {
      return null;
    }

    await this.recordLegacyFallback(providerId);
    await this.migrateLegacyCredential(providerId, legacyCredential);

    return legacyCredential;
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
    const legacyPrefix = this.getLegacyPrefix();
    const entries = await this.state.storage?.list({ prefix: scopedPrefix });
    const legacyEntries = await this.state.storage?.list({ prefix: legacyPrefix });

    const providerIds = new Set<ProviderId>();
    for (const key of entries?.keys() ?? []) {
      const providerId = key.substring(scopedPrefix.length);
      providerIds.add(providerId as ProviderId);
    }
    for (const key of legacyEntries?.keys() ?? []) {
      const providerId = key.substring(legacyPrefix.length);
      providerIds.add(providerId as ProviderId);
    }

    return Array.from(providerIds);
  }

  /**
   * Clear all provider credentials
   * ⚠️ DANGEROUS: Only use in testing
   *
   * Note: Uses a marker property instead of process.env to detect test mode,
   * since Cloudflare Workers don't have a process global by default.
   */
  async clearAll(): Promise<void> {
    const globalWithTestMarker = globalThis as typeof globalThis & {
      __TEST_MODE__?: boolean;
    };
    const isTestEnv = typeof globalWithTestMarker.__TEST_MODE__ !== "undefined";
    if (!isTestEnv) {
      throw new Error(
        "clearAll() is only available in test environments",
      );
    }

    await this.deleteEntriesByPrefix(this.getScopedPrefix());
    await this.deleteEntriesByPrefix(this.getLegacyPrefix());
    await this.state.storage?.delete(PROVIDER_MIGRATION_METRIC_KEY);

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
      const apiKey = await decryptToken(record.encryptedApiKey, this.encryptionKey);
      return {
        providerId,
        apiKey,
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

  private parseLegacyCredential(
    providerId: ProviderId,
    data: unknown,
  ): ProviderCredential | null {
    if (!data || typeof data !== "string") {
      return null;
    }
    try {
      const record = JSON.parse(data) as ProviderCredentialRecordV1;
      if (!record.apiKey) {
        return null;
      }
      return {
        providerId,
        apiKey: record.apiKey,
        connectedAt: record.connectedAt,
      };
    } catch (e) {
      console.error(
        `[provider/durable] Failed to parse legacy credential for ${providerId}:`,
        e,
      );
      return null;
    }
  }

  private async migrateLegacyCredential(
    providerId: ProviderId,
    legacyCredential: ProviderCredential,
  ): Promise<void> {
    const encryptedApiKey = await encryptToken(
      legacyCredential.apiKey,
      this.encryptionKey,
    );
    const migratedRecord: ProviderCredentialRecordV2 = {
      version: "v2",
      providerId,
      encryptedApiKey,
      keyFingerprint: createKeyFingerprint(legacyCredential.apiKey),
      connectedAt: legacyCredential.connectedAt,
      userId: this.scope.userId,
      workspaceId: this.scope.workspaceId,
    };

    await this.state.storage?.put(
      this.getScopedKey(providerId),
      JSON.stringify(migratedRecord),
    );
    console.log(
      `[provider/durable] Migrated legacy run-scoped credential to scoped store for ${providerId}`,
    );
  }

  private async recordLegacyFallback(providerId: ProviderId): Promise<void> {
    const rawCount = await this.state.storage?.get(PROVIDER_MIGRATION_METRIC_KEY);
    const count =
      typeof rawCount === "string" ? parseInt(rawCount, 10) || 0 : 0;
    const nextCount = count + 1;
    await this.state.storage?.put(PROVIDER_MIGRATION_METRIC_KEY, String(nextCount));
    console.warn(
      `[provider/durable] Legacy credential fallback used for ${providerId} (count=${nextCount})`,
    );
  }

  private getScopedPrefix(): string {
    return `${PROVIDER_STORE_V2_PREFIX}${sanitizeScopeSegment(this.scope.userId)}:${sanitizeScopeSegment(this.scope.workspaceId)}:`;
  }

  private getScopedKey(providerId: ProviderId): string {
    return `${this.getScopedPrefix()}${providerId}`;
  }

  private getLegacyPrefix(): string {
    return `${PROVIDER_STORE_LEGACY_PREFIX}${this.scope.runId}:`;
  }

  private getLegacyKey(providerId: ProviderId): string {
    return `${this.getLegacyPrefix()}${providerId}`;
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
}

function createKeyFingerprint(apiKey: string): string {
  const suffix = apiKey.slice(-4);
  return `****${suffix}`;
}
