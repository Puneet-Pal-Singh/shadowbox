import { describe, expect, it, vi } from "vitest";
import { ProviderCatalogService } from "./ProviderCatalogService";
import { ProviderRegistryService } from "./ProviderRegistryService";

describe("ProviderCatalogService", () => {
  it("returns only launch-visible providers in the public catalog", async () => {
    const expectedCatalogDiscoveryQuery = {
      view: "popular" as const,
      limit: 50,
    };
    const modelDiscoveryService = {
      getDiscoveredModels: vi.fn(async (providerId: string) => ({
        providerId,
        view: "popular" as const,
        models: [
          {
            id: `${providerId}-model`,
            name: `${providerId} model`,
            providerId,
          },
        ],
        page: {
          limit: 50,
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
    expect(providerIds).toContain("together");
    expect(providerIds).toContain("cerebras");
    expect(providerIds).not.toContain("mistral");
    expect(providerIds).not.toContain("cohere");
    const discoveryCalls = modelDiscoveryService.getDiscoveredModels.mock.calls as Array<
      [string, { view: string; limit: number }]
    >;
    expect(discoveryCalls.length).toBeGreaterThan(0);
    for (const [, query] of discoveryCalls) {
      expect(query).toEqual(expectedCatalogDiscoveryQuery);
    }
    expect(modelDiscoveryService.getDiscoveredModels).not.toHaveBeenCalledWith(
      "cohere",
      expect.anything(),
    );
  });

  it("hides platform-managed providers when availability resolver rejects them", async () => {
    const modelDiscoveryService = {
      getDiscoveredModels: vi.fn(async (providerId: string) => ({
        providerId,
        view: "popular" as const,
        models: [
          {
            id: `${providerId}-model`,
            name: `${providerId} model`,
            providerId,
          },
        ],
        page: {
          limit: 50,
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
      async (provider) => provider.providerId !== "axis",
    );

    const catalog = await service.getCatalog();
    expect(catalog.providers.map((provider) => provider.providerId)).not.toContain(
      "axis",
    );
  });
});
