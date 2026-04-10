/**
 * D1 Provider Model Cache Store
 *
 * D1-backed implementation of ProviderModelCacheStore.
 * Supports both global (provider-wide) and user-scoped (per-credential) caching.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type {
  ProviderModelCacheStore as IProviderModelCacheStore,
  ProviderModelCacheRecord,
  UserScopedCacheKey,
} from "./ProviderModelCacheStore";
import {
  BYOKDiscoveredProviderModelSchema,
  BYOKModelDiscoverySourceSchema,
} from "@repo/shared-types";
import { z } from "zod";

const ProviderModelCacheRecordSchema = z.object({
  version: z.literal("v1"),
  providerId: z.string(),
  models: z.array(BYOKDiscoveredProviderModelSchema),
  fetchedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  source: BYOKModelDiscoverySourceSchema,
});

interface CacheRow {
  provider_id: string;
  models_json: string;
  fetched_at: string;
  expires_at: string;
  source_version: string;
}

interface UserCacheRow {
  provider_id: string;
  credential_id: string;
  models_json: string;
  fetched_at: string;
  expires_at: string;
  source_version: string;
}

/**
 * D1ProviderModelCacheStore
 *
 * Shared/global provider model cache storage.
 * Also supports user-scoped caching for endpoints like /models/user.
 */
export class D1ProviderModelCacheStore implements IProviderModelCacheStore {
  constructor(private db: D1Database) {}

  async getModelCache(
    providerId: string,
  ): Promise<ProviderModelCacheRecord | null> {
    const query = `
      SELECT provider_id, models_json, fetched_at, expires_at, source_version
      FROM provider_registry_cache
      WHERE provider_id = ?
    `;

    const stmt = this.db.prepare(query).bind(providerId);
    const row = await stmt.first<CacheRow>();

    if (!row) {
      return null;
    }

    if (new Date(row.expires_at) < new Date()) {
      return null;
    }

    try {
      const models = JSON.parse(row.models_json) as unknown[];
      return {
        providerId: row.provider_id,
        models: BYOKDiscoveredProviderModelSchema.array().parse(models),
        fetchedAt: row.fetched_at,
        expiresAt: row.expires_at,
        source: "cache" as const,
      };
    } catch (error) {
      console.error(
        `[D1ProviderModelCacheStore/getModelCache] Failed to parse cache for provider: ${providerId}`,
        error,
      );
      return null;
    }
  }

  async setModelCache(record: ProviderModelCacheRecord): Promise<void> {
    const query = `
      INSERT INTO provider_registry_cache (
        provider_id, display_name, auth_modes_json, capabilities_json,
        models_json, source_version, fetched_at, expires_at, refreshed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id)
      DO UPDATE SET
        models_json = excluded.models_json,
        source_version = excluded.source_version,
        fetched_at = excluded.fetched_at,
        expires_at = excluded.expires_at,
        refreshed_at = excluded.refreshed_at
    `;

    const stmt = this.db
      .prepare(query)
      .bind(
        record.providerId,
        record.providerId,
        "[]",
        "{}",
        JSON.stringify(record.models),
        record.source,
        record.fetchedAt,
        record.expiresAt,
        record.fetchedAt,
      );

    const result = await stmt.run();
    if (!result.success) {
      throw new Error("Failed to set model cache");
    }
  }

  async invalidateModelCache(providerId: string): Promise<void> {
    const query = `
      DELETE FROM provider_registry_cache
      WHERE provider_id = ?
    `;

    const stmt = this.db.prepare(query).bind(providerId);
    await stmt.run();
  }

  async getUserModelCache(
    key: UserScopedCacheKey,
  ): Promise<ProviderModelCacheRecord | null> {
    const query = `
      SELECT provider_id, credential_id, models_json, fetched_at, expires_at, source_version
      FROM provider_user_model_cache
      WHERE provider_id = ? AND credential_id = ?
    `;

    const stmt = this.db.prepare(query).bind(key.providerId, key.credentialId);
    const row = await stmt.first<UserCacheRow>();

    if (!row) {
      return null;
    }

    if (new Date(row.expires_at) < new Date()) {
      return null;
    }

    try {
      const models = JSON.parse(row.models_json) as unknown[];
      return {
        providerId: row.provider_id,
        models: BYOKDiscoveredProviderModelSchema.array().parse(models),
        fetchedAt: row.fetched_at,
        expiresAt: row.expires_at,
        source: "cache" as const,
      };
    } catch (error) {
      console.error(
        `[D1ProviderModelCacheStore/getUserModelCache] Failed to parse cache for ${key.providerId}/${key.credentialId}`,
        error,
      );
      return null;
    }
  }

  async setUserModelCache(
    key: UserScopedCacheKey,
    record: ProviderModelCacheRecord,
  ): Promise<void> {
    const query = `
      INSERT INTO provider_user_model_cache (
        provider_id, credential_id, models_json, source_version, fetched_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id, credential_id)
      DO UPDATE SET
        models_json = excluded.models_json,
        source_version = excluded.source_version,
        fetched_at = excluded.fetched_at,
        expires_at = excluded.expires_at
    `;

    const stmt = this.db
      .prepare(query)
      .bind(
        key.providerId,
        key.credentialId,
        JSON.stringify(record.models),
        record.source,
        record.fetchedAt,
        record.expiresAt,
      );

    const result = await stmt.run();
    if (!result.success) {
      throw new Error("Failed to set user model cache");
    }
  }

  async invalidateUserModelCache(key: UserScopedCacheKey): Promise<void> {
    const query = `
      DELETE FROM provider_user_model_cache
      WHERE provider_id = ? AND credential_id = ?
    `;

    const stmt = this.db.prepare(query).bind(key.providerId, key.credentialId);
    await stmt.run();
  }
}
