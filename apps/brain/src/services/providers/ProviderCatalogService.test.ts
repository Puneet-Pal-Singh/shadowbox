import { describe, expect, it, vi } from "vitest";
import { ProviderCatalogService } from "./ProviderCatalogService";
import { ProviderRegistryService } from "./ProviderRegistryService";

describe("ProviderCatalogService", () => {
  it("returns only launch-visible providers in the public catalog", async () => {
    const modelDiscoveryService = {
      getDiscoveredModels: vi.fn(async (providerId: string) => ({
        providerId,
        view: "all" as const,
        models: [
          {
            id: `${providerId}-model`,
            name: `${providerId} model`,
            providerId,
          },
        ],
        page: {
          limit: 200,
          hasMore: false,
        },
        metadata: {
          fetchedAt: new Date().toISOString(),
          stale: false,
          source: "provider_api" as const,
        },
      })),
    };

    const service = new ProviderCatalogService(
      new ProviderRegistryService(),
      modelDiscoveryService as never,
    );

    const catalog = await service.getCatalog();
    const providerIds = catalog.providers.map((provider) => provider.providerId);

    expect(providerIds).toContain("axis");
    expect(providerIds).toContain("anthropic");
    expect(providerIds).toContain("google");
    expect(providerIds).toContain("mistral");
    expect(providerIds).toContain("together");
    expect(providerIds).toContain("cerebras");
    expect(providerIds).not.toContain("cohere");
    expect(modelDiscoveryService.getDiscoveredModels).not.toHaveBeenCalledWith(
      "cohere",
      expect.anything(),
    );
  });
});
