/**
 * ProviderCatalogService
 * Single Responsibility: Manage provider model catalog responses
 */

import type {
  ProviderCatalogResponse,
  ProviderCatalogEntry,
  ProviderId,
} from "@repo/shared-types";
import type { ModelsListResponse } from "../../schemas/provider";
import { PROVIDER_CATALOG } from "./catalog";
import { getProviderCapabilityFlags } from "./provider-capability-matrix";

const PROVIDER_DISPLAY_NAMES: Record<ProviderId, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  groq: "Groq",
};

/**
 * ProviderCatalogService - Manages provider model catalogs
 *
 * Provides read-only access to available models per provider.
 * Catalog is static and defined in catalog.ts.
 */
export class ProviderCatalogService {
  async getCatalog(): Promise<ProviderCatalogResponse> {
    const providers = this.buildCatalogEntries();
    return {
      providers,
      generatedAt: new Date().toISOString(),
    };
  }

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

  private buildCatalogEntries(): ProviderCatalogEntry[] {
    return (Object.keys(PROVIDER_CATALOG) as ProviderId[]).map(
      (providerId) => ({
        providerId,
        displayName: PROVIDER_DISPLAY_NAMES[providerId] ?? providerId,
        capabilities: getProviderCapabilityFlags(providerId),
        models: PROVIDER_CATALOG[providerId] ?? [],
      }),
    );
  }
}
