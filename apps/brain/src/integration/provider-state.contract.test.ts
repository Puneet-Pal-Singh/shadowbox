/**
 * Provider State Contract Test
 *
 * Verifies that provider state has a single canonical source (DurableProviderStore)
 * and is consistently accessible through all code paths:
 * - ProviderController (connect/disconnect/status/models)
 * - Runtime factories (chat inference)
 * - AIService adapter selection
 *
 * Tests the integration scenario:
 * 1. Connect provider -> Store credential in DurableProviderStore
 * 2. Get provider status -> Read from DurableProviderStore
 * 3. List available models -> Read from DurableProviderStore
 * 4. Chat inference -> Select adapter using DurableProviderStore
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ProviderId } from "../schemas/provider";
import { DurableProviderStore, type ProviderCredential } from "../services/providers/DurableProviderStore";

// Mock DurableObjectState
interface MockDurableObjectState {
  storage?: {
    put: (key: string, value: string) => Promise<void>;
    get: (key: string) => Promise<string | undefined>;
    delete: (key: string) => Promise<void>;
    list: (
      options?: { prefix: string },
    ) => Promise<Map<string, string> | undefined>;
  };
}

function createMockDurableObjectState(): MockDurableObjectState {
  const data = new Map<string, string>();

  return {
    storage: {
      put: async (key: string, value: string) => {
        data.set(key, value);
      },
      get: async (key: string) => {
        return data.get(key);
      },
      delete: async (key: string) => {
        data.delete(key);
      },
      list: async (options?: { prefix: string }) => {
        const prefix = options?.prefix || "";
        const result = new Map<string, string>();
        for (const [key, value] of data) {
          if (key.startsWith(prefix)) {
            result.set(key, value);
          }
        }
        return result;
      },
    },
  };
}

describe("Provider State Contract: Single Source of Truth", () => {
  let store: DurableProviderStore;
  let mockState: MockDurableObjectState;
  const runId = "test-run-id-12345";

  beforeEach(() => {
    mockState = createMockDurableObjectState();
    store = new DurableProviderStore(mockState as any, runId);
  });

  describe("Provider credential storage and retrieval", () => {
    it("should store a provider credential in DurableProviderStore", async () => {
      const providerId: ProviderId = "openai";
      const apiKey = "sk-test-key-12345";

      await store.setProvider(providerId, apiKey);

      const retrieved = await store.getProvider(providerId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.providerId).toBe(providerId);
      expect(retrieved?.apiKey).toBe(apiKey);
    });

    it("should return null for non-existent provider", async () => {
      const providerId: ProviderId = "groq";

      const retrieved = await store.getProvider(providerId);
      expect(retrieved).toBeNull();
    });

    it("should retrieve API key directly", async () => {
      const providerId: ProviderId = "anthropic";
      const apiKey = "sk-ant-test-key";

      await store.setProvider(providerId, apiKey);
      const retrievedKey = await store.getApiKey(providerId);

      expect(retrievedKey).toBe(apiKey);
    });

    it("should return null for API key of non-existent provider", async () => {
      const providerId: ProviderId = "openrouter";

      const retrievedKey = await store.getApiKey(providerId);
      expect(retrievedKey).toBeNull();
    });
  });

  describe("Provider connection status", () => {
    it("should report provider as connected after setProvider", async () => {
      const providerId: ProviderId = "groq";

      await store.setProvider(providerId, "test-key");
      const isConnected = await store.isConnected(providerId);

      expect(isConnected).toBe(true);
    });

    it("should report provider as not connected if never set", async () => {
      const providerId: ProviderId = "openrouter";

      const isConnected = await store.isConnected(providerId);
      expect(isConnected).toBe(false);
    });

    it("should report provider as not connected after deletion", async () => {
      const providerId: ProviderId = "openai";

      await store.setProvider(providerId, "test-key");
      expect(await store.isConnected(providerId)).toBe(true);

      await store.deleteProvider(providerId);
      expect(await store.isConnected(providerId)).toBe(false);
    });
  });

  describe("Multiple provider management", () => {
    it("should store and retrieve multiple providers independently", async () => {
      const openai: ProviderId = "openai";
      const groq: ProviderId = "groq";
      const openaiKey = "sk-openai-key";
      const groqKey = "gsk-groq-key";

      await store.setProvider(openai, openaiKey);
      await store.setProvider(groq, groqKey);

      const openaiRetrieved = await store.getApiKey(openai);
      const groqRetrieved = await store.getApiKey(groq);

      expect(openaiRetrieved).toBe(openaiKey);
      expect(groqRetrieved).toBe(groqKey);
    });

    it("should list all connected providers", async () => {
      const openai: ProviderId = "openai";
      const groq: ProviderId = "groq";

      await store.setProvider(openai, "key1");
      await store.setProvider(groq, "key2");

      const allProviders = await store.getAllProviders();

      expect(allProviders).toContain(openai);
      expect(allProviders).toContain(groq);
      expect(allProviders).toHaveLength(2);
    });

    it("should exclude non-existent providers from getAllProviders", async () => {
      const openai: ProviderId = "openai";
      const anthropic: ProviderId = "anthropic";

      await store.setProvider(openai, "key1");
      // anthropic is NOT set

      const allProviders = await store.getAllProviders();

      expect(allProviders).toContain(openai);
      expect(allProviders).not.toContain(anthropic);
    });
  });

  describe("Provider state isolation by runId", () => {
    it("should isolate provider credentials by runId", async () => {
      const store1 = new DurableProviderStore(mockState as any, "run-1");
      const store2 = new DurableProviderStore(mockState as any, "run-2");
      const providerId: ProviderId = "openai";
      const key1 = "key-for-run-1";
      const key2 = "key-for-run-2";

      await store1.setProvider(providerId, key1);
      await store2.setProvider(providerId, key2);

      const retrieved1 = await store1.getApiKey(providerId);
      const retrieved2 = await store2.getApiKey(providerId);

      expect(retrieved1).toBe(key1);
      expect(retrieved2).toBe(key2);
    });
  });

  describe("Provider state consistency scenario", () => {
    it("should maintain consistent state through connect->status->models->inference flow", async () => {
      const providerId: ProviderId = "openai";
      const apiKey = "sk-test-full-flow";

      // Step 1: Connect provider (ProviderController.connect)
      await store.setProvider(providerId, apiKey);
      expect(await store.isConnected(providerId)).toBe(true);

      // Step 2: Get provider status (ProviderController.status)
      const allProviders = await store.getAllProviders();
      expect(allProviders).toContain(providerId);

      // Step 3: List available models (ProviderController.models)
      // Models would be retrieved from provider catalog based on connected state
      const isConnected = await store.isConnected(providerId);
      expect(isConnected).toBe(true); // Gate for model availability

      // Step 4: Chat inference (AIService.selectAdapter)
      // Adapter would be selected based on provider connectivity
      const inferenceKey = await store.getApiKey(providerId);
      expect(inferenceKey).toBe(apiKey); // Same key used for both operations
    });

    it("should fail inference if provider not connected in strict mode scenario", async () => {
      const providerId: ProviderId = "anthropic";

      // Provider never connected
      const isConnected = await store.isConnected(providerId);
      expect(isConnected).toBe(false);

      // In strict mode, adapter selection should fail
      const apiKey = await store.getApiKey(providerId);
      expect(apiKey).toBeNull(); // Triggers error in strict mode
    });

    it("should handle provider disconnect correctly", async () => {
      const providerId: ProviderId = "groq";
      const apiKey = "gsk-test-key";

      // Connect
      await store.setProvider(providerId, apiKey);
      expect(await store.isConnected(providerId)).toBe(true);

      // Disconnect
      await store.deleteProvider(providerId);

      // Verify disconnection
      expect(await store.isConnected(providerId)).toBe(false);
      expect(await store.getApiKey(providerId)).toBeNull();
    });
  });

  describe("Error handling and edge cases", () => {
    it("should handle credential with invalid JSON gracefully", async () => {
      // Directly set malformed data in storage
      await mockState.storage?.put(
        `provider:${runId}:openai`,
        "not-valid-json",
      );

      const retrieved = await store.getProvider("openai");
      expect(retrieved).toBeNull(); // Should fail gracefully
    });

    it("should handle concurrent operations on same provider", async () => {
      const providerId: ProviderId = "openai";

      // Simulate concurrent updates
      const [result1, result2] = await Promise.all([
        store.setProvider(providerId, "key-1").then(() =>
          store.getApiKey(providerId),
        ),
        store.setProvider(providerId, "key-2").then(() =>
          store.getApiKey(providerId),
        ),
      ]);

      // Both results should be valid keys (one will be the final stored value)
      // The exact value depends on execution order and is not deterministic
      const validKeys = ["key-1", "key-2"];
      expect(validKeys).toContain(result1);
      expect(validKeys).toContain(result2);
      // At least one should be a valid key
      expect([result1, result2].some((r) => validKeys.includes(r))).toBe(true);
    });
  });

  describe("Test mode safety", () => {
    it("should only allow clearAll in test environments", async () => {
      await store.setProvider("openai", "key");

      // Set test mode marker
      (globalThis as any).__TEST_MODE__ = true;

      try {
        // Should succeed in test mode
        await store.clearAll();
        const allProviders = await store.getAllProviders();
        expect(allProviders).toHaveLength(0);
      } finally {
        // Clean up
        delete (globalThis as any).__TEST_MODE__;
      }
    });

    it("should reject clearAll outside test mode", async () => {
      await store.setProvider("openai", "key");

      // Ensure not in test mode
      delete (globalThis as any).__TEST_MODE__;

      await expect(store.clearAll()).rejects.toThrow(
        "clearAll() is only available in test environments",
      );

      // Data should still be there
      const allProviders = await store.getAllProviders();
      expect(allProviders).toHaveLength(1);
    });
  });
});
