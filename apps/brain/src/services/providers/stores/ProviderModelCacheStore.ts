/**
 * Provider Model Cache Store Interface
 *
 * Focused interface for provider model discovery cache.
 * This is a shared/global cache, not per-user.
 */

import type {
  BYOKDiscoveredProviderModel,
  BYOKModelDiscoverySource,
} from "@repo/shared-types";

export interface ProviderModelCacheRecord {
  providerId: string;
  models: BYOKDiscoveredProviderModel[];
  fetchedAt: string;
  expiresAt: string;
  source: BYOKModelDiscoverySource;
}

export interface ProviderModelCacheStore {
  /**
   * Get cached models for a provider
   */
  getModelCache(providerId: string): Promise<ProviderModelCacheRecord | null>;

  /**
   * Set model cache for a provider
   */
  setModelCache(record: ProviderModelCacheRecord): Promise<void>;

  /**
   * Invalidate cache for a provider
   */
  invalidateModelCache(providerId: string): Promise<void>;
}
