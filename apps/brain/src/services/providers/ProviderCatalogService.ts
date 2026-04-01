/**
 * ProviderCatalogService
 * Single Responsibility: Build provider catalog and provider model lists from
 * registry + dynamic discovery authority.
 */

import type {
  BYOKDiscoveredProviderModelsResponse,
  BYOKDiscoveredProviderModelsQuery,
  BYOKModelDiscoveryView,
  ModelDescriptor,
  ProviderCatalogEntry,
  ProviderCatalogResponse,
} from "@repo/shared-types";
import type { ModelsListResponse } from "../../schemas/provider";
import { ProviderRegistryService } from "./ProviderRegistryService";
import { ProviderModelDiscoveryService } from "./model-discovery";
import {
  AXIS_PROVIDER_ID,
  getAxisCatalogModels,
  getAxisDiscoveredModels,
} from "./axis";

const CATALOG_DISCOVERY_QUERY: BYOKDiscoveredProviderModelsQuery = {
  view: "all",
  limit: 200,
};

const MODELS_DISCOVERY_QUERY: BYOKDiscoveredProviderModelsQuery = {
  view: "all",
  limit: 1000,
};

export class ProviderCatalogService {
  constructor(
    private readonly registryService: ProviderRegistryService,
    private readonly modelDiscoveryService: ProviderModelDiscoveryService,
  ) {}

  async getCatalog(): Promise<ProviderCatalogResponse> {
    const registryProviders = this.registryService.listLaunchVisibleProviders();
    const providers: ProviderCatalogEntry[] = [];

    for (const provider of registryProviders) {
      const discoveredModels = await this.loadProviderModels(provider.providerId);
      providers.push({
        providerId: provider.providerId,
        displayName: provider.displayName,
        capabilities: provider.capabilities,
        models: discoveredModels,
      });
    }

    return {
      providers,
      generatedAt: new Date().toISOString(),
    };
  }

  async getModels(providerId: string): Promise<ModelsListResponse> {
    const models = await this.loadProviderModels(providerId);
    return {
      providerId,
      models,
      lastFetchedAt: new Date().toISOString(),
    };
  }

  private async loadProviderModels(providerId: string): Promise<ModelDescriptor[]> {
    if (providerId === AXIS_PROVIDER_ID) {
      return getAxisCatalogModels();
    }

    try {
      const discovered = await this.modelDiscoveryService.getDiscoveredModels(
        providerId,
        CATALOG_DISCOVERY_QUERY,
      );
      return discovered.models.map((model) => ({
        id: model.id,
        name: model.name,
        provider: providerId,
        contextWindow: model.contextWindow,
        description: model.description,
      }));
    } catch {
      const defaultModelId = this.registryService.getDefaultModel(providerId);
      if (!defaultModelId) {
        return [];
      }
      return [
        {
          id: defaultModelId,
          name: defaultModelId,
          provider: providerId,
        },
      ];
    }
  }

  async getDiscoveredModels(providerId: string): Promise<ModelsListResponse> {
    if (providerId === AXIS_PROVIDER_ID) {
      return {
        providerId,
        models: getAxisCatalogModels(),
        lastFetchedAt: new Date().toISOString(),
      };
    }

    const discovered = await this.modelDiscoveryService.getDiscoveredModels(
      providerId,
      MODELS_DISCOVERY_QUERY,
    );
    return {
      providerId,
      models: discovered.models.map((model) => ({
        id: model.id,
        name: model.name,
        provider: providerId,
      })),
      lastFetchedAt: discovered.metadata.fetchedAt,
    };
  }

  async getStaticDiscoveredModelsForAxis(query: {
    view: BYOKModelDiscoveryView;
    limit: number;
    cursor?: string;
  }): Promise<BYOKDiscoveredProviderModelsResponse> {
    const models = getAxisDiscoveredModels();
    const limited = models.slice(0, query.limit);
    return {
      providerId: AXIS_PROVIDER_ID,
      view: query.view,
      models: limited,
      page: {
        limit: query.limit,
        cursor: query.cursor,
        hasMore: false,
      },
      metadata: {
        fetchedAt: new Date().toISOString(),
        stale: false,
        source: "provider_api",
      },
    };
  }
}
