import type { DurableObjectState } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
import { DurableProviderStore } from "./DurableProviderStore";
import { CloudCredentialVault } from "./CloudCredentialVault";

describe("CloudCredentialVault", () => {
  it("persists and retrieves credentials through vault contract", async () => {
    const { state } = createMockDurableState();
    const store = new DurableProviderStore(
      state,
      { runId: "run-vault-1", userId: "user-1", workspaceId: "workspace-1" },
      "test-encryption-key",
    );
    const vault = new CloudCredentialVault(store);

    await vault.setCredential("openai", "sk-test-vault-1234567890");
    await expect(vault.isConnected("openai")).resolves.toBe(true);
    await expect(vault.getApiKey("openai")).resolves.toBe(
      "sk-test-vault-1234567890",
    );
  });

  it("lists and deletes connected providers", async () => {
    const { state } = createMockDurableState();
    const store = new DurableProviderStore(
      state,
      { runId: "run-vault-2", userId: "user-2", workspaceId: "workspace-2" },
      "test-encryption-key",
    );
    const vault = new CloudCredentialVault(store);

    await vault.setCredential("openai", "sk-test-vault-openai-1234567890");
    await vault.setCredential("groq", "gsk_test_vault_groq_1234567890");

    const providers = await vault.listConnectedProviders();
    expect(providers.sort()).toEqual(["groq", "openai"]);

    await vault.deleteCredential("openai");
    await expect(vault.getApiKey("openai")).resolves.toBeNull();
  });
});

function createMockDurableState(): {
  state: DurableObjectState;
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

  return { state };
}
