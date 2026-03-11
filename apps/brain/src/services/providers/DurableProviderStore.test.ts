import type { DurableObjectState } from "@cloudflare/workers-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderId } from "@repo/shared-types";
import { DurableProviderStore } from "./DurableProviderStore";

type MockStorage = Map<string, string>;

describe("DurableProviderStore", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists encrypted credentials (no plaintext apiKey at rest)", async () => {
    const { state, storage } = createMockDurableState();
    const store = new DurableProviderStore(
      state,
      { runId: "run-1", userId: "user-1", workspaceId: "workspace-1" },
      "test-encryption-key",
    );

    await store.setProvider("openai", "sk-test-sensitive-1234567890");

    const entry = getEntryBySuffix(storage, "openai");
    expect(entry).toBeDefined();
    const serialized = entry ?? "";
    expect(serialized).not.toContain("sk-test-sensitive-1234567890");
    expect(serialized).not.toContain("\"apiKey\"");

    const restored = await store.getApiKey("openai");
    expect(restored).toBe("sk-test-sensitive-1234567890");
  });

  it("ignores legacy run-scoped credentials in strict v3 mode", async () => {
    const { state, storage } = createMockDurableState();
    const providerId: ProviderId = "groq";
    const runId = "run-legacy";

    storage.set(
      `provider:${runId}:${providerId}`,
      JSON.stringify({
        providerId,
        apiKey: "gsk_legacy_key_1234567890",
        connectedAt: "2026-02-20T00:00:00.000Z",
      }),
    );

    const store = new DurableProviderStore(
      state,
      { runId, userId: "user-1", workspaceId: "workspace-1" },
      "test-encryption-key",
    );

    const apiKey = await store.getApiKey(providerId);
    expect(apiKey).toBeNull();
    expect(storage.get("provider:v2:user-1:workspace-1:groq")).toBeUndefined();
    expect(storage.has(`provider:${runId}:${providerId}`)).toBe(true);
  });

  it("stores provider preferences without polluting provider connection list", async () => {
    const { state } = createMockDurableState();
    const store = new DurableProviderStore(
      state,
      { runId: "run-2", userId: "user-2", workspaceId: "workspace-2" },
      "test-encryption-key",
    );

    await store.setProvider("openai", "sk-test-sensitive-1234567890");
    await store.updatePreferences({
      defaultProviderId: "openai",
      defaultModelId: "gpt-4o",
    });

    const providers = await store.getAllProviders();
    expect(providers).toEqual(["openai"]);

    const preferences = await store.getPreferences();
    expect(preferences.defaultProviderId).toBe("openai");
    expect(preferences.defaultModelId).toBe("gpt-4o");
  });

  it("seeds axis defaults when no preference record exists", async () => {
    const { state } = createMockDurableState();
    const store = new DurableProviderStore(
      state,
      { runId: "run-defaults", userId: "user-1", workspaceId: "workspace-1" },
      "test-encryption-key",
    );

    const preferences = await store.getPreferences();
    expect(preferences.defaultProviderId).toBe("axis");
    expect(preferences.defaultModelId).toBe("openai/gpt-oss-120b:free");
    expect(preferences.updatedAt).toBeTypeOf("string");
  });

  it("uses collision-safe scope encoding for storage keys", async () => {
    const { state, storage } = createMockDurableState();
    const storeA = new DurableProviderStore(
      state,
      { runId: "run-encoding", userId: "user@company", workspaceId: "workspace-1" },
      "test-encryption-key",
    );
    const storeB = new DurableProviderStore(
      state,
      { runId: "run-encoding", userId: "user_company", workspaceId: "workspace-1" },
      "test-encryption-key",
    );

    await storeA.setProvider("openai", "sk-test-sensitive-1111111111");
    await storeB.setProvider("openai", "sk-test-sensitive-2222222222");

    const providerKeys = Array.from(storage.keys()).filter((key) =>
      key.endsWith(":openai")
    );
    expect(providerKeys.length).toBe(2);
    expect(await storeA.getApiKey("openai")).toBe("sk-test-sensitive-1111111111");
    expect(await storeB.getApiKey("openai")).toBe("sk-test-sensitive-2222222222");
  });

  it("handles high-cardinality scoped writes without cross-scope leakage", async () => {
    const { state } = createMockDurableState();
    const scopeCount = 250;
    const stores: DurableProviderStore[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      for (let i = 0; i < scopeCount; i++) {
        const store = new DurableProviderStore(
          state,
          {
            runId: `run-scale-${i}`,
            userId: `user-${i}`,
            workspaceId: `workspace-${i % 5}`,
          },
          "test-encryption-key",
        );
        stores.push(store);
        await store.setProvider("openai", `sk-scale-key-${i}-1234567890`);
      }

      for (let i = 0; i < scopeCount; i++) {
        const key = await stores[i].getApiKey("openai");
        expect(key).toBe(`sk-scale-key-${i}-1234567890`);
      }
    } finally {
      logSpy.mockRestore();
    }
  });

  it("does not include legacy run-scoped records in provider list", async () => {
    const { state, storage } = createMockDurableState();
    storage.set(
      "provider:v2:user-1:workspace-1:openai",
      JSON.stringify({
        version: "v2",
        providerId: "openai",
        encryptedApiKey: { encrypted: "x", nonce: "n" },
        keyFingerprint: "sk-****7890",
        connectedAt: "2026-02-20T00:00:00.000Z",
        userId: "user-1",
        workspaceId: "workspace-1",
      }),
    );
    storage.set(
      "provider:run-dedupe:openai",
      JSON.stringify({
        providerId: "openai",
        apiKey: "sk_legacy_1234567890",
        connectedAt: "2026-02-20T00:00:00.000Z",
      }),
    );
    storage.set(
      "provider:run-dedupe:groq",
      JSON.stringify({
        providerId: "groq",
        apiKey: "gsk_legacy_1234567890",
        connectedAt: "2026-02-20T00:00:00.000Z",
      }),
    );

    const store = new DurableProviderStore(
      state,
      { runId: "run-dedupe", userId: "user-1", workspaceId: "workspace-1" },
      "test-encryption-key",
    );

    const providers = await store.getAllProviders();
    expect(providers).toEqual(["openai"]);
  });

  it("cleans up scoped keys on delete", async () => {
    const { state, storage } = createMockDurableState();

    const store = new DurableProviderStore(
      state,
      { runId: "run-delete", userId: "user-1", workspaceId: "workspace-1" },
      "test-encryption-key",
    );

    await store.setProvider("openai", "sk_scoped_key_1234567890");
    await store.deleteProvider("openai");

    expect(storage.get("provider:v2:user-1:workspace-1:openai")).toBeUndefined();
  });

  it("decrypts with previous key version and re-encrypts to current key", async () => {
    const { state, storage } = createMockDurableState();
    const scope = {
      runId: "run-rotation",
      userId: "user-1",
      workspaceId: "workspace-1",
    };
    const storeV1 = new DurableProviderStore(state, scope, {
      current: { version: "v1", key: "encryption-key-v1" },
    });
    await storeV1.setProvider("openai", "sk_rotation_key_1234567890");

    const storeV2 = new DurableProviderStore(state, scope, {
      current: { version: "v2", key: "encryption-key-v2" },
      previous: { version: "v1", key: "encryption-key-v1" },
    });

    await expect(storeV2.getApiKey("openai")).resolves.toBe(
      "sk_rotation_key_1234567890",
    );

    const raw = storage.get("provider:v2:user-1:workspace-1:openai");
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw ?? "{}") as { keyVersion?: string };
    expect(parsed.keyVersion).toBe("v2");
  });

  it("clears provider cache records during clearAll()", async () => {
    const { state, storage } = createMockDurableState();
    const store = new DurableProviderStore(
      state,
      { runId: "run-clear", userId: "user-1", workspaceId: "workspace-1" },
      "test-encryption-key",
    );

    await store.setModelCache({
      providerId: "openai",
      models: [{ id: "gpt-4o", name: "GPT-4o", providerId: "openai" }],
      fetchedAt: "2026-03-05T00:00:00.000Z",
      expiresAt: "2026-03-05T01:00:00.000Z",
      source: "provider_api",
    });
    const cacheKeys = Array.from(storage.keys()).filter((key) =>
      key.startsWith("provider:model-cache:v1:user-1:workspace-1:"),
    );
    expect(cacheKeys).toHaveLength(1);
    const cacheKey = cacheKeys[0]!;
    expect(storage.has(cacheKey)).toBe(true);

    await store.clearAll();
    expect(storage.has(cacheKey)).toBe(false);
  });

  it("drops malformed model cache payloads", async () => {
    const { state, storage } = createMockDurableState();
    const store = new DurableProviderStore(
      state,
      { runId: "run-cache", userId: "user-1", workspaceId: "workspace-1" },
      "test-encryption-key",
    );

    const cacheKey = "provider:model-cache:v1:user-1:workspace-1:openai";
    storage.set(
      cacheKey,
      JSON.stringify({
        version: "v1",
        providerId: "openai",
        models: "not-an-array",
        fetchedAt: "bad-date",
        expiresAt: "bad-date",
        source: "provider_api",
      }),
    );

    await expect(store.getModelCache("openai")).resolves.toBeNull();
    expect(storage.has(cacheKey)).toBe(false);
  });

  it("evicts model cache when payload providerId does not match requested provider", async () => {
    const { state, storage } = createMockDurableState();
    const store = new DurableProviderStore(
      state,
      { runId: "run-cache", userId: "user-1", workspaceId: "workspace-1" },
      "test-encryption-key",
    );

    const cacheKey = "provider:model-cache:v1:user-1:workspace-1:openai";
    storage.set(
      cacheKey,
      JSON.stringify({
        version: "v1",
        providerId: "google",
        models: [{ id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", providerId: "google" }],
        fetchedAt: "2026-03-05T00:00:00.000Z",
        expiresAt: "2026-03-05T01:00:00.000Z",
        source: "provider_api",
      }),
    );

    await expect(store.getModelCache("openai")).resolves.toBeNull();
    expect(storage.has(cacheKey)).toBe(false);
  });

});

function createMockDurableState(): {
  state: DurableObjectState;
  storage: MockStorage;
} {
  const storage = new Map<string, string>();
  const state = {
    storage: {
      put: async (key: string, value: string) => {
        storage.set(key, value);
      },
      get: async (key: string) => storage.get(key),
      delete: async (key: string) => {
        storage.delete(key);
      },
      list: async (options?: { prefix?: string }) => {
        const prefix = options?.prefix ?? "";
        const entries = new Map<string, string>();
        for (const [key, value] of storage.entries()) {
          if (key.startsWith(prefix)) {
            entries.set(key, value);
          }
        }
        return entries;
      },
    },
  } as unknown as DurableObjectState;

  return { state, storage };
}

function getEntryBySuffix(storage: MockStorage, suffix: string): string | undefined {
  for (const [key, value] of storage.entries()) {
    if (key.endsWith(`:${suffix}`)) {
      return value;
    }
  }
  return undefined;
}
