/**
 * ProviderCatalogService
 * Single Responsibility: Manage provider model catalogs (getModels)
 */

import type { ProviderId, ModelsListResponse } from "../../schemas/provider";
import { PROVIDER_CATALOG } from "./catalog";

/**
 * ProviderCatalogService - Manages provider model catalogs
 *
 * Provides read-only access to available models per provider.
 * Catalog is static and defined in catalog.ts.
 */
export class ProviderCatalogService {
  /**
   * Get available models for a provider
   */
  async getModels(providerId: ProviderId): Promise<ModelsListResponse> {
    try {
      const models = PROVIDER_CATALOG[providerId] || [];

      console.log(
        `[provider/catalog] Fetched ${models.length} models for ${providerId}`,
      );

      return {
        providerId,
        models,
        lastFetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`[provider/catalog] Error fetching models:`, error);
      throw error;
    }
  }
}
