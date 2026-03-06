/**
 * ProviderCatalogService
 * Single Responsibility: Build provider catalog and provider model lists from
 * registry + dynamic discovery authority.
 */

import type {
  BYOKDiscoveredProviderModelsQuery,
  ModelDescriptor,
  ProviderCatalogEntry,
  ProviderCatalogResponse,
} from "@repo/shared-types";
import type { ModelsListResponse } from "../../schemas/provider";
import { ProviderRegistryService } from "./ProviderRegistryService";
import { ProviderModelDiscoveryService } from "./model-discovery";

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
    const registryProviders = this.registryService.listProviders();
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
}
