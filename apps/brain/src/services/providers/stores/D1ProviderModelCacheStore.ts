/**
 * D1 Provider Model Cache Store
 *
 * D1-backed implementation of ProviderModelCacheStore.
 * This is a shared/global cache, not per-user.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type {
  ProviderModelCacheStore as IProviderModelCacheStore,
  ProviderModelCacheRecord,
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
  source: string;
}

/**
 * D1ProviderModelCacheStore
 *
 * Shared/global provider model cache storage.
 */
export class D1ProviderModelCacheStore implements IProviderModelCacheStore {
  constructor(private db: D1Database) {}

  async getModelCache(
    providerId: string,
  ): Promise<ProviderModelCacheRecord | null> {
    const query = `
      SELECT provider_id, models_json, fetched_at, expires_at, source
      FROM provider_registry_cache
      WHERE provider_id = ?
    `;

    const stmt = this.db.prepare(query).bind(providerId);
    const row = await stmt.first<CacheRow>();

    if (!row) {
      return null;
    }

    // Check if cache has expired
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
        source: "cache" as const, // Stored as cache in this implementation
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

    const stmt = this.db.prepare(query).bind(
      record.providerId,
      record.providerId, // display_name - use providerId as fallback
      "[]", // auth_modes_json
      "{}", // capabilities_json
      JSON.stringify(record.models),
      record.source,
      record.fetchedAt,
      record.expiresAt,
      record.fetchedAt, // Use fetchedAt as refreshed_at
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
}
