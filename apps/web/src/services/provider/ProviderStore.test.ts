/**
 * ProviderStore Tests
 *
 * Tests for state management, actions, and synchronization.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  BYOKCredential,
  BYOKCredentialValidateResponse,
  BYOKPreference,
  BYOKPreferencesUpdateRequest,
  BYOKResolution,
  ProviderRegistryEntry,
} from "@repo/shared-types";
import {
  ProviderStore,
  ConnectCredentialRequest,
  ProviderApiClientContract,
} from "./ProviderStore.js";

describe("ProviderStore", () => {
  let store: ProviderStore;
  let mockApiClient: ProviderApiClientContract;

  const credential1Id = "550e8400-e29b-41d4-a716-446655440000";
  const credential2Id = "550e8400-e29b-41d4-a716-446655440001";

  beforeEach(() => {
    // Reset singleton between tests
    (ProviderStore as unknown as { instance?: ProviderStore }).instance = undefined;

    const catalog: ProviderRegistryEntry[] = [
      {
        providerId: "openai",
        displayName: "OpenAI",
        authModes: ["api_key"],
        adapterFamily: "openai-compatible",
        capabilities: {
          streaming: true,
          tools: true,
          jsonMode: true,
          structuredOutputs: true,
        },
        modelSource: "static",
      },
    ];

    const credentials: BYOKCredential[] = [
      {
        credentialId: credential1Id,
        userId: "user-1",
        workspaceId: "ws-1",
        providerId: "openai",
        label: "Production",
        keyFingerprint: "abc123xyz",
        encryptedSecretJson: "{}",
        keyVersion: "1",
        status: "connected",
        lastValidatedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
    ];

    const preferences: BYOKPreference = {
      userId: "user-1",
      workspaceId: "ws-1",
      defaultProviderId: "openai",
      defaultCredentialId: credential1Id,
      defaultModelId: "gpt-4",
      visibleModelIds: {},
      updatedAt: new Date().toISOString(),
    };

    const resolvedConfig: BYOKResolution = {
      providerId: "openai",
      credentialId: credential1Id,
      modelId: "gpt-4",
      resolvedAt: "workspace_preference",
      resolvedAtTime: new Date().toISOString(),
    };

    const connectedCredential: BYOKCredential = {
      credentialId: credential2Id,
      userId: "user-1",
      workspaceId: "ws-1",
      providerId: "openai",
      label: "Testing",
      keyFingerprint: "def456uvw",
      encryptedSecretJson: "{}",
      keyVersion: "1",
      status: "connected",
      lastValidatedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };

    mockApiClient = {
      getCatalog: vi.fn(async () => catalog),
      getProviderModels: vi.fn(async (providerId: string, query?: unknown) => {
        void query;
        return {
          providerId,
          view: "popular" as const,
          models: [
            {
              id: "openrouter/auto",
              name: "Auto",
              provider: "openrouter",
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
        };
      }),
      refreshProviderModels: vi.fn(async (providerId: string) => ({
        providerId,
        refreshedAt: new Date().toISOString(),
        source: "provider_api" as const,
        cacheInvalidated: true,
        modelsCount: 1,
      })),
      getCredentials: vi.fn(async () => credentials),
      getPreferences: vi.fn(async () => preferences),
      connectCredential: vi.fn(async (req: ConnectCredentialRequest) => {
        void req;
        return connectedCredential;
      }),
      disconnectCredential: vi.fn(async (credentialId: string) => {
        void credentialId;
        return undefined;
      }),
      validateCredential: vi.fn(
        async (
          credentialId: string,
          req: { mode: "format" | "live" }
        ): Promise<BYOKCredentialValidateResponse> => {
          void credentialId;
          void req;
          return {
            credentialId: credential1Id,
            valid: true,
            validatedAt: new Date().toISOString(),
          };
        }
      ),
      updatePreferences: vi.fn(
        async (partial: BYOKPreferencesUpdateRequest) => {
        void partial;
        return {
          ...preferences,
          defaultModelId: "gpt-4-turbo",
        };
      }),
      resolveForChat: vi.fn(
        async (req: {
          providerId?: string;
          credentialId?: string;
          modelId?: string;
        }) => {
          void req;
          return resolvedConfig;
        }
      ),
    } satisfies ProviderApiClientContract;

    store = ProviderStore.getInstance({ apiClient: mockApiClient });
  });

  describe("initialization", () => {
    it("starts in idle state", () => {
      const state = store.getState();
      expect(state.status).toBe("idle");
      expect(state.catalog).toEqual([]);
      expect(state.credentials).toEqual([]);
      expect(state.providerModels).toEqual({});
      expect(state.providerModelsMetadata).toEqual({});
      expect(state.providerModelsPage).toEqual({});
    });

    it("uses singleton pattern", () => {
      const store1 = ProviderStore.getInstance({ apiClient: mockApiClient });
      const store2 = ProviderStore.getInstance({ apiClient: mockApiClient });
      expect(store1).toBe(store2);
    });

    it("requests bootstrap when binding the first active run", () => {
      expect(store.setActiveRunId("run-1")).toBe(true);
    });

    it("does not request bootstrap again once the active run is ready", async () => {
      expect(store.setActiveRunId("run-1")).toBe(true);
      await store.bootstrap();

      expect(store.setActiveRunId("run-1")).toBe(false);
    });
  });

  describe("bootstrap", () => {
    it("fetches catalog, credentials, and preferences", async () => {
      await store.bootstrap();

      expect(mockApiClient.getCatalog).toHaveBeenCalled();
      expect(mockApiClient.getCredentials).toHaveBeenCalled();
      expect(mockApiClient.getPreferences).toHaveBeenCalled();
    });

    it("loads provider models on demand", async () => {
      const models = await store.loadProviderModels("openrouter");
      expect(models).toHaveLength(1);
      expect(mockApiClient.getProviderModels).toHaveBeenCalledWith(
        "openrouter",
        expect.objectContaining({
          view: "popular",
          limit: 50,
        })
      );
      expect(store.getState().providerModels.openrouter).toHaveLength(1);
      expect(store.getState().providerModelsPage.openrouter?.view).toBe("popular");
    });

    it("switches model view and reloads selected provider models", async () => {
      await store.bootstrap();
      await store.loadProviderModels("openai");

      vi.mocked(mockApiClient.getProviderModels).mockResolvedValueOnce({
        providerId: "openai",
        view: "all" as const,
        models: [
          { id: "openai/gpt-4.1", name: "GPT-4.1", provider: "openai" },
          { id: "openai/gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "openai" },
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
      });

      await store.setModelView("all");

      expect(mockApiClient.getProviderModels).toHaveBeenLastCalledWith(
        "openai",
        expect.objectContaining({ view: "all" })
      );
      expect(store.getState().selectedModelView).toBe("all");
    });

    it("loads additional pages and merges unique models", async () => {
      await store.loadProviderModels("openai", { view: "all" });

      vi.mocked(mockApiClient.getProviderModels).mockResolvedValueOnce({
        providerId: "openai",
        view: "all" as const,
        models: [
          { id: "openai/gpt-4.1", name: "GPT-4.1", provider: "openai" },
          { id: "openrouter/auto", name: "Auto", provider: "openrouter" },
        ],
        page: {
          limit: 50,
          cursor: "1",
          hasMore: false,
        },
        metadata: {
          fetchedAt: new Date().toISOString(),
          stale: true,
          source: "cache" as const,
          staleReason: "provider_api_unavailable",
        },
      });

      // Simulate existing pagination metadata before loading more.
      await store.loadProviderModels("openai", {
        view: "all",
        cursor: "1",
        append: true,
      });

      const state = store.getState();
      expect(state.providerModels.openai?.map((model) => model.id)).toEqual([
        "openrouter/auto",
        "openai/gpt-4.1",
      ]);
      expect(state.providerModelsMetadata.openai?.stale).toBe(true);
    });

    it("refreshes models and reloads active view", async () => {
      await store.loadProviderModels("openai", { view: "popular" });
      await store.refreshProviderModels("openai");

      expect(mockApiClient.refreshProviderModels).toHaveBeenCalledWith("openai");
      expect(mockApiClient.getProviderModels).toHaveBeenLastCalledWith(
        "openai",
        expect.objectContaining({
          view: "popular",
          limit: 50,
        }),
      );
    });

    it("sets status to ready on success", async () => {
      await store.bootstrap();

      const state = store.getState();
      expect(state.status).toBe("ready");
      expect(state.catalog).toHaveLength(1);
      expect(state.credentials).toHaveLength(1);
      expect(state.selectedProviderId).toBe("openai");
      expect(state.selectedCredentialId).toBe(credential1Id);
      expect(state.selectedModelId).toBe("gpt-4");
    });

    it("sets status to error on failure", async () => {
      vi.mocked(mockApiClient.getCatalog).mockRejectedValueOnce(
        new Error("Network error")
      );

      await expect(store.bootstrap()).rejects.toThrow("Network error");

      const state = store.getState();
      expect(state.status).toBe("error");
      expect(state.error).toContain("Network error");
    });

    it("prevents concurrent bootstrap calls", async () => {
      const promise1 = store.bootstrap();
      const promise2 = store.bootstrap();

      await Promise.all([promise1, promise2]);

      expect(mockApiClient.getCatalog).toHaveBeenCalledTimes(1);
    });
  });

  describe("connect credential", () => {
    it("connects a new credential", async () => {
      await store.bootstrap();

      const req: ConnectCredentialRequest = {
        providerId: "openai",
        secret: "sk-test",
      };

      await store.connectCredential(req);

      const state = store.getState();
      expect(state.credentials).toHaveLength(2);
      expect(
        state.credentials.some((c) => c.credentialId === credential2Id)
      ).toBe(true);
    });

    it("deduplicates concurrent connect requests", async () => {
      const req: ConnectCredentialRequest = {
        providerId: "openai",
        secret: "sk-test",
      };

      await Promise.all([store.connectCredential(req), store.connectCredential(req)]);

      expect(mockApiClient.connectCredential).toHaveBeenCalledTimes(1);
    });
  });

  describe("disconnect credential", () => {
    it("removes credential from list", async () => {
      await store.bootstrap();

      await store.disconnectCredential(credential1Id);

      const state = store.getState();
      expect(state.credentials).toHaveLength(0);
    });

    it("clears selection if disconnecting selected credential", async () => {
      await store.bootstrap();
      store.setSelection("openai", credential1Id, "gpt-4");

      await store.disconnectCredential(credential1Id);

      const state = store.getState();
      expect(state.selectedCredentialId).toBeNull();
    });
  });

  describe("setSelection", () => {
    it("updates provider/credential/model selection", () => {
      store.setSelection("openai", credential1Id, "gpt-4");

      const state = store.getState();
      expect(state.selectedProviderId).toBe("openai");
      expect(state.selectedCredentialId).toBe(credential1Id);
      expect(state.selectedModelId).toBe("gpt-4");
    });

    it("applies session selection through single store-owned path", async () => {
      await store.bootstrap();

      const resolved = await store.applySessionSelection({
        providerId: "openai",
        credentialId: credential1Id,
        modelId: "gpt-4",
      });

      const state = store.getState();
      expect(state.selectedProviderId).toBe("openai");
      expect(state.selectedCredentialId).toBe(credential1Id);
      expect(state.lastResolvedConfig).toEqual(resolved);
      expect(mockApiClient.updatePreferences).toHaveBeenCalledWith({
        defaultProviderId: "openai",
        defaultModelId: "gpt-4",
      });
      expect(mockApiClient.resolveForChat).toHaveBeenCalledTimes(1);
    });
  });

  describe("resolveForChat", () => {
    it("resolves provider config", async () => {
      await store.bootstrap();
      store.setSelection("openai", credential1Id, "gpt-4");

      const config = await store.resolveForChat();

      expect(config.providerId).toBe("openai");
      expect(config.credentialId).toBe(credential1Id);
    });

    it("deduplicates concurrent resolve requests", async () => {
      await store.bootstrap();

      await Promise.all([store.resolveForChat(), store.resolveForChat()]);

      expect(mockApiClient.resolveForChat).toHaveBeenCalledTimes(1);
    });

    it("reuses cached resolution for stable selection", async () => {
      await store.bootstrap();

      const first = await store.resolveForChat();
      const second = await store.resolveForChat();

      expect(first).toEqual(second);
      expect(mockApiClient.resolveForChat).toHaveBeenCalledTimes(1);
    });

    it("requests platform defaults when no provider is connected", async () => {
      vi.mocked(mockApiClient.getCredentials).mockResolvedValueOnce([]);
      vi.mocked(mockApiClient.resolveForChat).mockResolvedValueOnce({
        providerId: "openrouter",
        credentialId: "",
        modelId: "google/gemma-2-9b-it:free",
        resolvedAt: "platform_defaults",
        resolvedAtTime: new Date().toISOString(),
      });
      await store.bootstrap();

      const config = await store.resolveForChat();

      expect(config.providerId).toBe("openrouter");
      expect(config.resolvedAt).toBe("platform_defaults");
      expect(mockApiClient.resolveForChat).toHaveBeenCalledWith({});
    });
  });

  describe("state ownership integration", () => {
    it("keeps selection consistent across connect, preference update, and disconnect", async () => {
      await store.bootstrap();

      const connectReq: ConnectCredentialRequest = {
        providerId: "openai",
        secret: "sk-test",
      };
      await store.connectCredential(connectReq);

      vi.mocked(mockApiClient.updatePreferences).mockResolvedValueOnce({
        userId: "user-1",
        workspaceId: "ws-1",
        defaultProviderId: "openai",
        defaultCredentialId: credential2Id,
        defaultModelId: "gpt-4-turbo",
        visibleModelIds: {},
        updatedAt: new Date().toISOString(),
      });
      await store.updatePreferences({ defaultModelId: "gpt-4-turbo" });

      await store.disconnectCredential(credential1Id);

      const state = store.getState();
      expect(state.preferences?.defaultModelId).toBe("gpt-4-turbo");
      expect(state.credentials).toHaveLength(1);
      expect(state.credentials[0]?.credentialId).toBe(credential2Id);
      expect(state.selectedCredentialId).toBe(credential2Id);
      expect(state.selectedProviderId).toBe("openai");
    });
  });

  describe("subscribe", () => {
    it("notifies listeners on state change", () => {
      const listener = vi.fn();
      store.subscribe(listener);

      store.setSelection("openai", credential1Id);

      expect(listener).toHaveBeenCalled();
      const state = listener.mock.calls[0][0];
      expect(state.selectedProviderId).toBe("openai");
    });

    it("unsubscribes listener", () => {
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      unsubscribe();
      store.setSelection("openai", credential1Id);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("clearError", () => {
    it("clears error message", () => {
      const state = store.getState();
      expect(state.error).toBeNull();

      store.clearError();
      expect(store.getState().error).toBeNull();
    });
  });
});
