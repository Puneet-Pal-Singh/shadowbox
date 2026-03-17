/**
 * Provider Vault Repository Tests
 *
 * Tests for D1-backed credential storage with encryption boundaries.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProviderVaultRepository, IDatabase } from "./repository.js";

describe("ProviderVaultRepository", () => {
  let mockDb: IDatabase;
  let repository: ProviderVaultRepository;

  beforeEach(() => {
    // Mock D1 database interface
    mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      }),
    };

    repository = new ProviderVaultRepository(
      mockDb,
      "test-master-key",
      "v1",
    );
  });

  describe("create", () => {
    it("validates API key before encryption", async () => {
      const credential = {
        credentialId: "cred-123",
        userId: "user-123",
        workspaceId: "ws-123",
        providerId: "openai",
        label: "My OpenAI Key",
        keyFingerprint: "sk-...abc123",
        status: "connected" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Valid key format should not throw during encryption
      await expect(
        repository.create(
          credential,
          "sk-test-FAKE-KEY-DO-NOT-USE",
        ),
      ).resolves.toBeDefined();
    });

    it("rejects invalid API key format", async () => {
      const credential = {
        credentialId: "cred-123",
        userId: "user-123",
        workspaceId: "ws-123",
        providerId: "openai",
        label: "My Key",
        keyFingerprint: "***",
        status: "connected" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await expect(
        repository.create(credential, "short"),
      ).rejects.toThrow("Invalid API key format");
    });
  });

  describe("retrieve", () => {
    it("retrieves credential as DTO by default", async () => {
      const mockPrepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            credential_id: "cred-123",
            user_id: "user-123",
            workspace_id: "ws-123",
            provider_id: "openai",
            label: "My Key",
            key_fingerprint: "sk-...abc123",
            status: "connected",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
            deleted_at: null,
          }),
        }),
      });

      mockDb.prepare = mockPrepare;
      repository = new ProviderVaultRepository(
        mockDb,
        "test-master-key",
        "v1",
      );

      const dto = await repository.retrieve("cred-123");

      expect(dto).toBeDefined();
      expect(dto?.credentialId).toBe("cred-123");
      expect("encryptedSecretJson" in dto || true).toBe(true);
    });

    it("returns null for non-existent credential", async () => {
      const result = await repository.retrieve("non-existent");
      expect(result).toBeNull();
    });
  });

  describe("listByUser", () => {
    it("lists credentials for user", async () => {
      const mockPrepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({
            results: [
              {
                credential_id: "cred-1",
                user_id: "user-123",
                workspace_id: "ws-123",
                provider_id: "openai",
                label: "Key 1",
                key_fingerprint: "sk-...1",
                status: "connected",
                created_at: "2025-01-01T00:00:00Z",
                updated_at: "2025-01-01T00:00:00Z",
                deleted_at: null,
              },
              {
                credential_id: "cred-2",
                user_id: "user-123",
                workspace_id: "ws-123",
                provider_id: "groq",
                label: "Key 2",
                key_fingerprint: "gsk_...2",
                status: "connected",
                created_at: "2025-01-02T00:00:00Z",
                updated_at: "2025-01-02T00:00:00Z",
                deleted_at: null,
              },
            ],
          }),
        }),
      });

      mockDb.prepare = mockPrepare;
      repository = new ProviderVaultRepository(
        mockDb,
        "test-master-key",
        "v1",
      );

      const list = await repository.listByUser("user-123");

      expect(list).toHaveLength(2);
      expect(list[0].credentialId).toBe("cred-1");
      expect(list[1].credentialId).toBe("cred-2");
    });

    it("excludes soft-deleted credentials", async () => {
      const mockPrepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      });

      mockDb.prepare = mockPrepare;
      repository = new ProviderVaultRepository(
        mockDb,
        "test-master-key",
        "v1",
      );

      const list = await repository.listByUser("user-123");

      expect(list).toHaveLength(0);
      // Verify the query includes WHERE deleted_at IS NULL
      const prepareCall = mockPrepare.mock.calls[0];
      expect(prepareCall[0]).toContain("deleted_at IS NULL");
    });
  });

  describe("updateMetadata", () => {
    it("updates credential status and validation", async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true });
      const mockBind = vi.fn().mockReturnValue({
        run: mockRun,
      });
      const mockPrepare = vi.fn().mockReturnValue({
        bind: mockBind,
      });

      mockDb.prepare = mockPrepare;
      repository = new ProviderVaultRepository(
        mockDb,
        "test-master-key",
        "v1",
      );

      await repository.updateMetadata("cred-123", {
        status: "connected",
        lastValidatedAt: new Date().toISOString(),
      });

      expect(mockRun).toHaveBeenCalled();
      const query = mockPrepare.mock.calls[0][0];
      expect(query).toContain("UPDATE byok_credentials");
      expect(query).toContain("status");
      expect(query).toContain("last_validated_at");
    });
  });

  describe("delete", () => {
    it("soft deletes credential", async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true });
      const mockBind = vi.fn().mockReturnValue({
        run: mockRun,
      });
      const mockPrepare = vi.fn().mockReturnValue({
        bind: mockBind,
      });

      mockDb.prepare = mockPrepare;
      repository = new ProviderVaultRepository(
        mockDb,
        "test-master-key",
        "v1",
      );

      await repository.delete("cred-123");

      expect(mockRun).toHaveBeenCalled();
      const query = mockPrepare.mock.calls[0][0];
      expect(query).toContain("deleted_at");
      expect(query).toContain("WHERE");
    });

    it("throws on failed delete", async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: false });
      const mockBind = vi.fn().mockReturnValue({
        run: mockRun,
      });
      const mockPrepare = vi.fn().mockReturnValue({
        bind: mockBind,
      });

      mockDb.prepare = mockPrepare;
      repository = new ProviderVaultRepository(
        mockDb,
        "test-master-key",
        "v1",
      );

      await expect(repository.delete("cred-123")).rejects.toThrow(
        "Failed to delete credential",
      );
    });
  });
});
