import { describe, expect, it, vi } from "vitest";
import type { DurableProviderStore } from "../DurableProviderStore";
import type { ProviderCredentialService } from "../ProviderCredentialService";
import type { ProviderModelCatalogPort } from "./ProviderModelCatalogPort";
import { ProviderModelDiscoveryService } from "./ProviderModelDiscoveryService";

function createStoreStub() {
  let cache: {
    providerId: string;
    models: Array<{ id: string; name: string; providerId: string }>;
    fetchedAt: string;
    expiresAt: string;
    source: "provider_api" | "cache";
  } | null = null;

  return {
    getScopeSnapshot: () => ({ userId: "user-1", workspaceId: "ws-1" }),
    getModelCache: vi.fn(async () => cache),
    setModelCache: vi.fn(async (record: typeof cache) => {
      cache = record;
    }),
    invalidateModelCache: vi.fn(async () => {
      cache = null;
    }),
  };
}

describe("ProviderModelDiscoveryService", () => {
  it("fetches and caches openrouter models", async () => {
    const store = createStoreStub();
    const credentialService = {
      getApiKey: vi.fn(async () => "sk-or-test"),
    } as unknown as ProviderCredentialService;
    const adapter: ProviderModelCatalogPort = {
      fetchAll: vi.fn(async () => [
        { id: "openrouter/auto", name: "Auto", providerId: "openrouter" },
      ]),
      fetchPage: vi.fn(),
    };

    const service = new ProviderModelDiscoveryService(
      store as unknown as DurableProviderStore,
      credentialService,
      { openrouter: adapter },
    );

    const first = await service.getOpenRouterModels({ view: "all", limit: 50 });
    const second = await service.getOpenRouterModels({ view: "all", limit: 50 });

    expect(first.models).toHaveLength(1);
    expect(second.models).toHaveLength(1);
    expect(adapter.fetchAll).toHaveBeenCalledTimes(1);
    expect(store.setModelCache).toHaveBeenCalledTimes(1);
  });

  it("returns stale cache when provider API fails", async () => {
    const store = createStoreStub();
    const now = Date.now();
    await store.setModelCache({
      providerId: "openrouter",
      models: [{ id: "openrouter/auto", name: "Auto", providerId: "openrouter" }],
      fetchedAt: new Date(now - 120_000).toISOString(),
      expiresAt: new Date(now - 1_000).toISOString(),
      source: "provider_api",
    });
    const credentialService = {
      getApiKey: vi.fn(async () => "sk-or-test"),
    } as unknown as ProviderCredentialService;
    const adapter: ProviderModelCatalogPort = {
      fetchAll: vi.fn(async () => {
        throw new Error("provider down");
      }),
      fetchPage: vi.fn(),
    };

    const service = new ProviderModelDiscoveryService(
      store as unknown as DurableProviderStore,
      credentialService,
      { openrouter: adapter },
    );
    const result = await service.getOpenRouterModels({ view: "all", limit: 50 });
    expect(result.metadata.stale).toBe(true);
    expect(result.metadata.source).toBe("cache");
    expect(result.metadata.staleReason).toBe("provider_api_unavailable");
  });

  it("emits discovery observability metrics for cache-hit and stale serving", async () => {
    const store = createStoreStub();
    const now = Date.now();
    await store.setModelCache({
      providerId: "openrouter",
      models: [{ id: "openrouter/auto", name: "Auto", providerId: "openrouter" }],
      fetchedAt: new Date(now - 1000).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(),
      source: "provider_api",
    });
    const credentialService = {
      getApiKey: vi.fn(async () => "sk-or-test"),
    } as unknown as ProviderCredentialService;
    const adapter: ProviderModelCatalogPort = {
      fetchAll: vi.fn(async () => []),
      fetchPage: vi.fn(),
    };
    const service = new ProviderModelDiscoveryService(
      store as unknown as DurableProviderStore,
      credentialService,
      { openrouter: adapter },
    );

    await service.getDiscoveredModels("openrouter", { view: "all", limit: 50 });
    const metrics = service.getObservabilityMetrics();
    expect(metrics.model_discovery_cache_hits_total.openrouter).toBe(1);
    expect(metrics.model_discovery_requests_total.openrouter_provider_api_success).toBe(
      1,
    );
  });
});
