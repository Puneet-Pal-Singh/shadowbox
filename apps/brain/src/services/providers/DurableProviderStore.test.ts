import type { DurableObjectState } from "@cloudflare/workers-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderId } from "../../schemas/provider";
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

  it("treats legacy run-scoped credentials as unsupported after cutover", async () => {
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

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const apiKey = await store.getApiKey(providerId);
    expect(apiKey).toBeNull();
    expect(storage.get("provider:v2:user-1:workspace-1:groq")).toBeUndefined();
    expect(storage.has(`provider:${runId}:${providerId}`)).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      `[provider/durable] Legacy run-scoped credential detected for ${providerId}; legacy format is unsupported after BYOK cutover. Reconnect provider.`,
    );
  });

  it("returns null when legacy credential inspection fails", async () => {
    const getError = new Error("storage unavailable");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = {
      storage: {
        put: async () => {},
        get: async (_key: string) => {
          throw getError;
        },
        delete: async () => {},
        list: async () => new Map<string, string>(),
      },
    } as unknown as DurableObjectState;

    const store = new DurableProviderStore(
      state,
      { runId: "run-error", userId: "user-1", workspaceId: "workspace-1" },
      "test-encryption-key",
    );

    await expect(store.getApiKey("openai")).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "[provider/durable] Failed to inspect legacy credential for openai:",
      getError,
    );
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

  it("cleans up scoped and legacy keys on delete", async () => {
    const { state, storage } = createMockDurableState();
    const runId = "run-delete";
    storage.set(
      `provider:${runId}:openai`,
      JSON.stringify({
        providerId: "openai",
        apiKey: "sk_legacy_concurrency_1234567890",
        connectedAt: "2026-02-20T00:00:00.000Z",
      }),
    );

    const store = new DurableProviderStore(
      state,
      { runId, userId: "user-1", workspaceId: "workspace-1" },
      "test-encryption-key",
    );

    await store.setProvider("openai", "sk_scoped_key_1234567890");
    await store.deleteProvider("openai");

    expect(storage.has(`provider:${runId}:openai`)).toBe(false);
    expect(storage.get("provider:v2:user-1:workspace-1:openai")).toBeUndefined();
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
