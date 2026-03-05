import type {
  BYOKDiscoveredProviderModelsQuery,
  BYOKDiscoveredProviderModelsRefreshResponse,
  BYOKDiscoveredProviderModelsResponse,
  ProviderId,
} from "@repo/shared-types";
import type {
  DurableProviderStore,
  ProviderModelCacheRecord,
} from "../DurableProviderStore";
import type { ProviderCredentialService } from "../ProviderCredentialService";
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

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

type SupportedDiscoveryProvider = ProviderId;

export class ProviderModelDiscoveryService {
  private readonly adapters: Record<SupportedDiscoveryProvider, ProviderModelCatalogPort>;
  private readonly rankingService: ProviderModelRankingService;

  constructor(
    private readonly store: DurableProviderStore,
    private readonly credentialService: ProviderCredentialService,
    adapters?: Partial<Record<SupportedDiscoveryProvider, ProviderModelCatalogPort>>,
    rankingService?: ProviderModelRankingService,
  ) {
    this.adapters = {
      openrouter: adapters?.openrouter ?? new OpenRouterModelCatalogAdapter(),
      openai:
        adapters?.openai ??
        new OpenAICompatibleModelCatalogAdapter("openai", "https://api.openai.com/v1"),
      groq:
        adapters?.groq ??
        new OpenAICompatibleModelCatalogAdapter("groq", "https://api.groq.com/openai/v1"),
      google: adapters?.google ?? new GoogleModelCatalogAdapter(),
    };
    this.rankingService = rankingService ?? new ProviderModelRankingService();
  }

  async getOpenRouterModels(
    query: BYOKDiscoveredProviderModelsQuery,
  ): Promise<BYOKDiscoveredProviderModelsResponse> {
    return this.getDiscoveredModels("openrouter", query);
  }

  async refreshOpenRouterModels(): Promise<BYOKDiscoveredProviderModelsRefreshResponse> {
    return this.refreshDiscoveredModels("openrouter");
  }

  async getDiscoveredModels(
    providerId: SupportedDiscoveryProvider,
    query: BYOKDiscoveredProviderModelsQuery,
  ): Promise<BYOKDiscoveredProviderModelsResponse> {
    const fullList = await this.getCatalogWithCache(providerId);
    const ranked = await this.rankModels(providerId, query.view, fullList.models);
    const page = toPage(ranked, query.cursor, query.limit);

    return {
      providerId,
      view: query.view,
      models: page.models,
      page: {
        limit: query.limit,
        cursor: query.cursor,
        nextCursor: page.nextCursor,
        hasMore: page.nextCursor !== undefined,
      },
      metadata: {
        fetchedAt: fullList.fetchedAt,
        stale: fullList.source === "cache" && isExpired(fullList.expiresAt),
        source: fullList.source,
        staleReason: fullList.staleReason,
      },
    };
  }

  async refreshDiscoveredModels(
    providerId: SupportedDiscoveryProvider,
  ): Promise<BYOKDiscoveredProviderModelsRefreshResponse> {
    await this.store.invalidateModelCache(providerId);
    const fresh = await this.fetchAndCacheModels(providerId);
    return {
      providerId,
      refreshedAt: fresh.fetchedAt,
      source: "provider_api",
      cacheInvalidated: true,
      modelsCount: fresh.models.length,
    };
  }

  private async rankModels(
    providerId: SupportedDiscoveryProvider,
    view: BYOKDiscoveredProviderModelsQuery["view"],
    models: ProviderModelCacheRecord["models"],
  ) {
    if (view !== "popular") {
      return models;
    }
    const signals = buildDefaultSignals(models.map((model) => model.id));
    const ranked = await this.rankingService.computePopular({
      providerId,
      models,
      signals,
      limit: 50,
    });
    return ranked.models;
  }

  private async getCatalogWithCache(
    providerId: SupportedDiscoveryProvider,
  ): Promise<ProviderModelCacheRecord & { staleReason?: string }> {
    const cached = await this.readCache(providerId);
    if (cached && !isExpired(cached.expiresAt)) {
      return cached;
    }

    try {
      return await this.fetchAndCacheModels(providerId);
    } catch (error) {
      if (cached) {
        return {
          ...cached,
          source: "cache",
          staleReason: "provider_api_unavailable",
        };
      }
      throw error;
    }
  }

  private async fetchAndCacheModels(
    providerId: SupportedDiscoveryProvider,
  ): Promise<ProviderModelCacheRecord> {
    const apiKey = await this.credentialService.getApiKey(providerId);
    if (!apiKey) {
      throw new ProviderModelDiscoveryAuthError(
        `${providerId} credentials are not connected for model discovery.`,
      );
    }
    const scope = this.store.getScopeSnapshot();
    const adapter = this.adapters[providerId];
    const models = await adapter.fetchAll(providerId, {
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      apiKey,
    });
    const fetchedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + MODEL_CACHE_TTL_MS).toISOString();
    const record: ProviderModelCacheRecord = {
      providerId,
      models,
      fetchedAt,
      expiresAt,
      source: "provider_api",
    };
    await this.store.setModelCache(record);
    return record;
  }

  private async readCache(providerId: string): Promise<ProviderModelCacheRecord | null> {
    try {
      return await this.store.getModelCache(providerId);
    } catch (error) {
      throw new ProviderModelCacheError(
        toErrorMessage(error, "Failed to read provider model cache."),
      );
    }
  }
}

function buildDefaultSignals(modelIds: string[]) {
  const signalMap: Record<string, number> = {};
  for (const modelId of modelIds) {
    signalMap[modelId] = 0;
  }
  return {
    modelSelectionFrequency: { ...signalMap },
    successfulRunFrequency: { ...signalMap },
    providerDeclaredBoost: { ...signalMap },
    capabilityFit: { ...signalMap },
    costEfficiency: { ...signalMap },
  };
}

function toPage(
  models: ProviderModelCacheRecord["models"],
  cursor: string | undefined,
  limit: number,
) {
  const offset = parseCursor(cursor);
  const nextOffset = offset + limit;
  return {
    models: models.slice(offset, nextOffset),
    nextCursor: nextOffset < models.length ? String(nextOffset) : undefined,
  };
}

function parseCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const parsed = Number(cursor);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ProviderModelDiscoveryApiError(
      `Invalid cursor "${cursor}" for model discovery.`,
      { status: 400, retryable: false },
    );
  }
  return parsed;
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
