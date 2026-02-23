/**
 * ByokStore Tests
 *
 * Tests for state management, actions, and synchronization.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ByokStore, ConnectCredentialRequest } from "./ByokStore.js";

describe("ByokStore", () => {
  let store: ByokStore;
  let mockApiClient: Record<string, unknown>;

  beforeEach(() => {
    // Reset singleton
    (ByokStore as Record<string, unknown>).instance = undefined;

    mockApiClient = {
      getCatalog: vi.fn().mockResolvedValue([
        {
          providerId: "openai",
          displayName: "OpenAI",
          authModes: ["api_key"],
        },
      ]),
      getCredentials: vi.fn().mockResolvedValue([
        {
          credentialId: "cred-1",
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
      ]),
      getPreferences: vi.fn().mockResolvedValue({
        defaultProviderId: "openai",
        defaultCredentialId: "cred-1",
        defaultModelId: "gpt-4",
      }),
      connectCredential: vi.fn().mockResolvedValue({
        credentialId: "cred-2",
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
      }),
      disconnectCredential: vi.fn().mockResolvedValue(undefined),
      validateCredential: vi.fn().mockResolvedValue({ valid: true }),
      updatePreferences: vi.fn().mockResolvedValue({
        defaultProviderId: "openai",
        defaultModelId: "gpt-4-turbo",
      }),
      resolveForChat: vi.fn().mockResolvedValue({
        providerId: "openai",
        credentialId: "cred-1",
        modelId: "gpt-4",
        resolvedAt: "workspace_preference",
        resolvedAtTime: new Date().toISOString(),
        fallbackUsed: false,
      }),
    };

    store = ByokStore.getInstance({ apiClient: mockApiClient });
  });

  describe("initialization", () => {
    it("starts in idle state", () => {
      const state = store.getState();
      expect(state.status).toBe("idle");
      expect(state.catalog).toEqual([]);
      expect(state.credentials).toEqual([]);
    });

    it("uses singleton pattern", () => {
      const store1 = ByokStore.getInstance({ apiClient: mockApiClient });
      const store2 = ByokStore.getInstance({ apiClient: mockApiClient });
      expect(store1).toBe(store2);
    });
  });

  describe("bootstrap", () => {
    it("fetches catalog, credentials, and preferences", async () => {
      await store.bootstrap();

      expect(mockApiClient.getCatalog).toHaveBeenCalled();
      expect(mockApiClient.getCredentials).toHaveBeenCalled();
      expect(mockApiClient.getPreferences).toHaveBeenCalled();
    });

    it("sets status to ready on success", async () => {
      await store.bootstrap();

      const state = store.getState();
      expect(state.status).toBe("ready");
      expect(state.catalog).toHaveLength(1);
      expect(state.credentials).toHaveLength(1);
    });

    it("sets status to error on failure", async () => {
      mockApiClient.getCatalog.mockRejectedValueOnce(
        new Error("Network error")
      );

      try {
        await store.bootstrap();
      } catch {
        // Expected
      }

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
      expect(state.credentials.some((c) => c.credentialId === "cred-2")).toBe(true);
    });

    it("deduplicates concurrent connect requests", async () => {
      const req: ConnectCredentialRequest = {
        providerId: "openai",
        secret: "sk-test",
      };

      await Promise.all([
        store.connectCredential(req),
        store.connectCredential(req),
      ]);

      expect(mockApiClient.connectCredential).toHaveBeenCalledTimes(1);
    });
  });

  describe("disconnect credential", () => {
    it("removes credential from list", async () => {
      await store.bootstrap();

      await store.disconnectCredential("cred-1");

      const state = store.getState();
      expect(state.credentials).toHaveLength(0);
    });

    it("clears selection if disconnecting selected credential", async () => {
      await store.bootstrap();
      store.setSelection("openai", "cred-1", "gpt-4");

      await store.disconnectCredential("cred-1");

      const state = store.getState();
      expect(state.selectedCredentialId).toBeNull();
    });
  });

  describe("setSelection", () => {
    it("updates provider/credential/model selection", () => {
      store.setSelection("openai", "cred-1", "gpt-4");

      const state = store.getState();
      expect(state.selectedProviderId).toBe("openai");
      expect(state.selectedCredentialId).toBe("cred-1");
      expect(state.selectedModelId).toBe("gpt-4");
    });
  });

  describe("resolveForChat", () => {
    it("resolves provider config", async () => {
      await store.bootstrap();
      store.setSelection("openai", "cred-1", "gpt-4");

      const config = await store.resolveForChat();

      expect(config.providerId).toBe("openai");
      expect(config.credentialId).toBe("cred-1");
    });

    it("deduplicates concurrent resolve requests", async () => {
      await store.bootstrap();

      await Promise.all([
        store.resolveForChat(),
        store.resolveForChat(),
      ]);

      expect(mockApiClient.resolveForChat).toHaveBeenCalledTimes(1);
    });
  });

  describe("subscribe", () => {
    it("notifies listeners on state change", async () => {
      const listener = vi.fn();
      store.subscribe(listener);

      store.setSelection("openai", "cred-1");

      expect(listener).toHaveBeenCalled();
      const state = listener.mock.calls[0][0];
      expect(state.selectedProviderId).toBe("openai");
    });

    it("unsubscribes listener", async () => {
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      unsubscribe();
      store.setSelection("openai", "cred-1");

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
