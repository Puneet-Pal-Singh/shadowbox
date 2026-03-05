import type {
  BYOKDiscoveredProviderModelsQuery,
  BYOKDiscoveredProviderModelsRefreshResponse,
  BYOKDiscoveredProviderModelsResponse,
  ProviderRegistryEntry,
} from "@repo/shared-types";
import type {
  DurableProviderStore,
  ProviderModelCacheRecord,
} from "../DurableProviderStore";
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

export class ProviderModelDiscoveryService {
  private readonly adapters: Map<string, ProviderModelCatalogPort>;
  private readonly rankingService: ProviderModelRankingService;
  private readonly observability: ProviderModelDiscoveryObservability;
  private readonly registryService: ProviderRegistryService;

  constructor(
    private readonly store: DurableProviderStore,
    private readonly credentialService: ProviderCredentialService,
    registryOrAdapters?: ProviderRegistryService | Partial<Record<string, ProviderModelCatalogPort>>,
    adaptersOrRanking?: Partial<Record<string, ProviderModelCatalogPort>> | ProviderModelRankingService,
    rankingOrObservability?: ProviderModelRankingService | ProviderModelDiscoveryObservability,
    maybeObservability?: ProviderModelDiscoveryObservability,
  ) {
    const {
      registryService,
      adapters,
      rankingService,
      observability,
    } = resolveConstructorArgs(
      registryOrAdapters,
      adaptersOrRanking,
      rankingOrObservability,
      maybeObservability,
    );

    this.registryService = registryService;
    this.adapters = buildAdapterRegistry(this.registryService, adapters);
    this.rankingService = rankingService;
    this.observability = observability;
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
    providerId: string,
    query: BYOKDiscoveredProviderModelsQuery,
  ): Promise<BYOKDiscoveredProviderModelsResponse> {
    const startedAt = Date.now();
    try {
      const fullList = await this.getCatalogWithCache(providerId);
      const ranked = await this.rankModels(providerId, query.view, fullList.models);
      const page = toPage(ranked, query.cursor, query.limit);
      const stale = fullList.source === "cache" && isExpired(fullList.expiresAt);
      const response: BYOKDiscoveredProviderModelsResponse = {
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
          stale,
          source: fullList.source,
          staleReason: fullList.staleReason,
        },
      };
      this.observability.recordRequest({
        providerId,
        source: response.metadata.source,
        stale: response.metadata.stale,
        success: true,
        latencyMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      this.observability.recordRequest({
        providerId,
        source: "provider_api",
        stale: false,
        success: false,
        latencyMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  async refreshDiscoveredModels(
    providerId: string,
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

  getObservabilityMetrics() {
    return this.observability.getMetrics();
  }

  getObservabilityAlerts() {
    return this.observability.getAlerts();
  }

  private async rankModels(
    providerId: string,
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
    providerId: string,
  ): Promise<ProviderModelCacheRecord & { staleReason?: string }> {
    const cached = await this.readCache(providerId);
    if (cached && !isExpired(cached.expiresAt)) {
      this.observability.recordCacheHit(providerId);
      return cached;
    }

    try {
      return await this.fetchAndCacheModels(providerId);
    } catch (error) {
      this.observability.recordAdapterFailure(providerId, toDiscoveryErrorCode(error));
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
    providerId: string,
  ): Promise<ProviderModelCacheRecord> {
    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new ProviderModelCacheError(
        `No discovery adapter is registered for provider "${providerId}".`,
      );
    }

    const apiKey = await this.credentialService.getApiKey(providerId);
    if (!apiKey) {
      throw new ProviderModelDiscoveryAuthError(
        `${providerId} credentials are not connected for model discovery.`,
      );
    }
    const scope = this.store.getScopeSnapshot();
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

function resolveConstructorArgs(
  registryOrAdapters:
    | ProviderRegistryService
    | Partial<Record<string, ProviderModelCatalogPort>>
    | undefined,
  adaptersOrRanking:
    | Partial<Record<string, ProviderModelCatalogPort>>
    | ProviderModelRankingService
    | undefined,
  rankingOrObservability:
    | ProviderModelRankingService
    | ProviderModelDiscoveryObservability
    | undefined,
  maybeObservability: ProviderModelDiscoveryObservability | undefined,
): {
  registryService: ProviderRegistryService;
  adapters: Partial<Record<string, ProviderModelCatalogPort>>;
  rankingService: ProviderModelRankingService;
  observability: ProviderModelDiscoveryObservability;
} {
  const defaultRegistry = new ProviderRegistryService();
  const defaultRanking = new ProviderModelRankingService();
  const defaultObservability = new ProviderModelDiscoveryObservability();

  if (registryOrAdapters instanceof ProviderRegistryService) {
    return {
      registryService: registryOrAdapters,
      adapters:
        !adaptersOrRanking || adaptersOrRanking instanceof ProviderModelRankingService
          ? {}
          : adaptersOrRanking,
      rankingService:
        adaptersOrRanking instanceof ProviderModelRankingService
          ? adaptersOrRanking
          : rankingOrObservability instanceof ProviderModelRankingService
            ? rankingOrObservability
            : defaultRanking,
      observability:
        rankingOrObservability instanceof ProviderModelDiscoveryObservability
          ? rankingOrObservability
          : maybeObservability ?? defaultObservability,
    };
  }

  return {
    registryService: defaultRegistry,
    adapters: registryOrAdapters ?? {},
    rankingService:
      adaptersOrRanking instanceof ProviderModelRankingService
        ? adaptersOrRanking
        : rankingOrObservability instanceof ProviderModelRankingService
          ? rankingOrObservability
          : defaultRanking,
    observability:
      rankingOrObservability instanceof ProviderModelDiscoveryObservability
        ? rankingOrObservability
        : maybeObservability ?? defaultObservability,
  };
}

function buildAdapterRegistry(
  registryService: ProviderRegistryService,
  provided: Partial<Record<string, ProviderModelCatalogPort>>,
): Map<string, ProviderModelCatalogPort> {
  const adapters = new Map<string, ProviderModelCatalogPort>();
  for (const provider of registryService.listProviders()) {
    const adapter =
      provided[provider.providerId] ?? createAdapterForProvider(provider);
    if (!adapter) {
      continue;
    }
    adapters.set(provider.providerId, adapter);
  }
  return adapters;
}

function createAdapterForProvider(
  provider: ProviderRegistryEntry,
): ProviderModelCatalogPort | undefined {
  if (provider.providerId === "openrouter") {
    return new OpenRouterModelCatalogAdapter();
  }

  if (provider.adapterFamily === "google-native") {
    return new GoogleModelCatalogAdapter();
  }

  if (provider.adapterFamily === "openai-compatible") {
    const endpoint =
      provider.modelsEndpoint ??
      (provider.baseUrl ? `${provider.baseUrl.replace(/\/$/, "")}/models` : undefined);
    if (!endpoint) {
      return undefined;
    }
    return new OpenAICompatibleModelCatalogAdapter(provider.providerId, endpoint);
  }

  return undefined;
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

function toDiscoveryErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return "UNKNOWN";
}
