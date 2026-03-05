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

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

export class ProviderModelDiscoveryService {
  private readonly openRouterAdapter: ProviderModelCatalogPort;

  constructor(
    private readonly store: DurableProviderStore,
    private readonly credentialService: ProviderCredentialService,
    openRouterAdapter?: ProviderModelCatalogPort,
  ) {
    this.openRouterAdapter = openRouterAdapter ?? new OpenRouterModelCatalogAdapter();
  }

  async getOpenRouterModels(
    query: BYOKDiscoveredProviderModelsQuery,
  ): Promise<BYOKDiscoveredProviderModelsResponse> {
    const fullList = await this.getOpenRouterCatalogWithCache();
    const page = toPage(fullList.models, query.cursor, query.limit);
    const models = query.view === "popular" ? page.models.slice(0, 50) : page.models;
    return {
      providerId: "openrouter",
      view: query.view,
      models,
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

  async refreshOpenRouterModels(): Promise<BYOKDiscoveredProviderModelsRefreshResponse> {
    await this.store.invalidateModelCache("openrouter");
    const fresh = await this.fetchAndCacheOpenRouterModels();
    return {
      providerId: "openrouter",
      refreshedAt: fresh.fetchedAt,
      source: "provider_api",
      cacheInvalidated: true,
      modelsCount: fresh.models.length,
    };
  }

  private async getOpenRouterCatalogWithCache(): Promise<
    ProviderModelCacheRecord & { staleReason?: string }
  > {
    const cached = await this.readCache("openrouter");
    if (cached && !isExpired(cached.expiresAt)) {
      return cached;
    }

    try {
      return await this.fetchAndCacheOpenRouterModels();
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

  private async fetchAndCacheOpenRouterModels(): Promise<ProviderModelCacheRecord> {
    const apiKey = await this.credentialService.getApiKey("openrouter" as ProviderId);
    if (!apiKey) {
      throw new ProviderModelDiscoveryAuthError(
        "OpenRouter credentials are not connected for model discovery.",
      );
    }
    const scope = this.store.getScopeSnapshot();
    const models = await this.openRouterAdapter.fetchAll("openrouter", {
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      apiKey,
    });
    const fetchedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + MODEL_CACHE_TTL_MS).toISOString();
    const record: ProviderModelCacheRecord = {
      providerId: "openrouter",
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
