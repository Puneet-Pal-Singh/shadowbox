import type { DurableObjectState } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
import type { ProviderId } from "../../schemas/provider";
import { DurableProviderStore } from "./DurableProviderStore";

type MockStorage = Map<string, string>;

describe("DurableProviderStore", () => {
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

  it("uses legacy run-scoped fallback and migrates into scoped encrypted key", async () => {
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
    expect(apiKey).toBe("gsk_legacy_key_1234567890");

    const migrated = storage.get("provider:v2:user-1:workspace-1:groq");
    expect(migrated).toBeDefined();
    expect(migrated).not.toContain("\"apiKey\"");
    expect(storage.get("provider:migration:legacy_fallback_reads")).toBe("1");
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
