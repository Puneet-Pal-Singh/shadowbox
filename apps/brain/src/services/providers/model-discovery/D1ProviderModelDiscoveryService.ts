/**
 * D1 Provider Model Discovery Service
 *
 * D1-backed model discovery that uses ProviderModelCacheStore.
 * This is a D1-compatible version that doesn't depend on DurableProviderStore.
 */

import type {
  BYOKDiscoveredProviderModelsQuery,
  BYOKDiscoveredProviderModelsRefreshResponse,
  BYOKDiscoveredProviderModelsResponse,
  ProviderRegistryEntry,
} from "@repo/shared-types";
import type {
  ProviderModelCacheStore,
  ProviderModelCacheRecord,
} from "../stores/ProviderModelCacheStore";
import type { ProviderCredentialService } from "../ProviderCredentialService";
import { ProviderRegistryService } from "../ProviderRegistryService";
import {
  ProviderModelCacheError,
  ProviderModelDiscoveryAuthError,
  ProviderModelDiscoveryApiError,
} from "./errors";
import type { ProviderModelCatalogPort } from "./ProviderModelCatalogPort";
import { OpenRouterModelCatalogAdapter } from "./adapters/OpenRouterModelCatalogAdapter";
import { GoogleModelCatalogAdapter } from "./adapters/GoogleModelCatalogAdapter";
import { OpenAICompatibleModelCatalogAdapter } from "./adapters/OpenAICompatibleModelCatalogAdapter";
import { ProviderModelRankingService } from "./ProviderModelRankingService";
import { ProviderModelDiscoveryObservability } from "./ProviderModelDiscoveryObservability";

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

export class D1ProviderModelDiscoveryService {
  private readonly adapters: Map<string, ProviderModelCatalogPort>;
  private readonly rankingService: ProviderModelRankingService;
  private readonly observability: ProviderModelDiscoveryObservability;
  private readonly registryService: ProviderRegistryService;

  constructor(
    private readonly cacheStore: ProviderModelCacheStore,
    private readonly credentialService: ProviderCredentialService,
    registryOrAdapters?:
      | ProviderRegistryService
      | Partial<Record<string, ProviderModelCatalogPort>>,
    adaptersOrRanking?:
      | Partial<Record<string, ProviderModelCatalogPort>>
      | ProviderModelRankingService,
    rankingOrObservability?:
      | ProviderModelRankingService
      | ProviderModelDiscoveryObservability,
    maybeObservability?: ProviderModelDiscoveryObservability,
  ) {
    const { registryService, adapters, rankingService, observability } =
      resolveConstructorArgs(
        registryOrAdapters,
        adaptersOrRanking,
        rankingOrObservability,
        maybeObservability,
      );

    this.registryService = registryService;
    this.adapters = adapters;
    this.rankingService = rankingService;
    this.observability = observability;
  }

  async getDiscoveredModels(
    providerId: string,
    query: BYOKDiscoveredProviderModelsQuery,
  ): Promise<BYOKDiscoveredProviderModelsResponse> {
    try {
      const cache = await this.cacheStore.getModelCache(providerId);
      const now = new Date();

      if (cache && new Date(cache.expiresAt) > now) {
        return {
          providerId,
          models: this.rankingService.filterAndRank(
            cache.models,
            query.search,
            query.capabilities,
          ),
          fetchedAt: cache.fetchedAt,
          expiresAt: cache.expiresAt,
          source: cache.source,
        };
      }

      return await this.refreshAndGetModels(providerId, query);
    } catch (error) {
      throw this.observability.wrapError(
        error,
        "getDiscoveredModels",
        providerId,
      );
    }
  }

  async refreshDiscoveredModels(
    providerId: string,
  ): Promise<BYOKDiscoveredProviderModelsRefreshResponse> {
    try {
      await this.refreshAndGetModels(providerId, {});
      return {
        providerId,
        refreshedAt: new Date().toISOString(),
        source: "provider_api",
        cacheInvalidated: false,
        modelsCount: 0,
      };
    } catch (error) {
      return {
        providerId,
        refreshedAt: new Date().toISOString(),
        source: "provider_api",
        cacheInvalidated: true,
        modelsCount: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async refreshAndGetModels(
    providerId: string,
    query: BYOKDiscoveredProviderModelsQuery,
  ): Promise<BYOKDiscoveredProviderModelsResponse> {
    const registryEntry = this.registryService.getEntry(providerId);
    if (!registryEntry) {
      throw new ProviderModelDiscoveryApiError(
        providerId,
        `Unknown provider: ${providerId}`,
      );
    }

    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new ProviderModelDiscoveryApiError(
        providerId,
        `No adapter for provider: ${providerId}`,
      );
    }

    const apiKey = await this.credentialService.getApiKey(providerId);
    if (!apiKey) {
      throw new ProviderModelDiscoveryAuthError(
        providerId,
        "No API key available",
      );
    }

    const models = await adapter.listModels(apiKey, registryEntry);
    const ranked = this.rankingService.filterAndRank(
      models,
      query.search,
      query.capabilities,
    );

    const now = new Date();
    const expiresAt = new Date(now.getTime() + MODEL_CACHE_TTL_MS);

    await this.cacheStore.setModelCache({
      providerId,
      models: ranked,
      fetchedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      source: "provider_api",
    });

    return {
      providerId,
      models: ranked,
      fetchedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      source: "provider_api",
    };
  }
}

function resolveConstructorArgs(
  registryOrAdapters?:
    | ProviderRegistryService
    | Partial<Record<string, ProviderModelCatalogPort>>,
  adaptersOrRanking?:
    | Partial<Record<string, ProviderModelCatalogPort>>
    | ProviderModelRankingService,
  rankingOrObservability?:
    | ProviderModelRankingService
    | ProviderModelDiscoveryObservability,
  maybeObservability?: ProviderModelDiscoveryObservability,
): {
  registryService: ProviderRegistryService;
  adapters: Map<string, ProviderModelCatalogPort>;
  rankingService: ProviderModelRankingService;
  observability: ProviderModelDiscoveryObservability;
} {
  const registryService =
    registryOrAdapters instanceof ProviderRegistryService
      ? registryOrAdapters
      : new ProviderRegistryService();

  const rankingService =
    rankingOrObservability instanceof ProviderModelRankingService
      ? rankingOrObservability
      : new ProviderModelRankingService();

  const observability =
    maybeObservability instanceof ProviderModelDiscoveryObservability
      ? maybeObservability
      : new ProviderModelDiscoveryObservability();

  let adapters: Map<string, ProviderModelCatalogPort>;
  if (
    registryOrAdapters &&
    !(registryOrAdapters instanceof ProviderRegistryService)
  ) {
    adapters = new Map(Object.entries(registryOrAdapters));
  } else {
    adapters = new Map<string, ProviderModelCatalogPort>([
      ["openrouter", new OpenRouterModelCatalogAdapter()],
      ["google", new GoogleModelCatalogAdapter()],
      ["openai-compatible", new OpenAICompatibleModelCatalogAdapter()],
    ]);
  }

  return { registryService, adapters, rankingService, observability };
}
