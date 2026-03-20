/**
 * Provider Vault Repository Tests
 *
 * Tests for D1-backed credential storage with encryption boundaries.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProviderVaultRepository, IDatabase } from "./repository.js";

const TEST_MASTER_KEY = "test-master-key-for-encryption-tests-32chars";

describe("ProviderVaultRepository", () => {
  let mockDb: IDatabase;
  let repository: ProviderVaultRepository;

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      }),
    };

    repository = new ProviderVaultRepository(mockDb, TEST_MASTER_KEY, "v1");
  });

  describe("create", () => {
    it("validates API key before encryption", async () => {
      const credential = {
        credentialId: "cred-123",
        userId: "user-123",
        workspaceId: "ws-123",
        providerId: "openai" as const,
        label: "My OpenAI Key",
        keyFingerprint: "sk-...abc123",
        status: "connected" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastValidatedAt: null,
        deletedAt: null,
      };

      await expect(
        repository.create(credential, "sk-test-FAKE-KEY-DO-NOT-USE"),
      ).resolves.toBeDefined();
    });

    it("rejects invalid API key format", async () => {
      const credential = {
        credentialId: "cred-123",
        userId: "user-123",
        workspaceId: "ws-123",
        providerId: "openai" as const,
        label: "My Key",
        keyFingerprint: "***",
        status: "connected" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastValidatedAt: null,
        deletedAt: null,
      };

      await expect(repository.create(credential, "short")).rejects.toThrow(
        "Invalid API key format",
      );
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
            encrypted_secret_json:
              '{"alg":"AES-256-GCM","ciphertext":"","iv":"","tag":"","keyVersion":"v1"}',
            key_version: "v1",
            status: "connected",
            last_validated_at: null,
            last_error_code: null,
            last_error_message: null,
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
            deleted_at: null,
          }),
        }),
      });

      mockDb.prepare = mockPrepare;
      repository = new ProviderVaultRepository(mockDb, TEST_MASTER_KEY, "v1");

      const dto = await repository.retrieve("cred-123");

      expect(dto).toBeDefined();
      expect(dto?.credentialId).toBe("cred-123");
    });

    it("returns null for non-existent credential", async () => {
      const result = await repository.retrieve("non-existent");
      expect(result).toBeNull();
    });
  });

  describe("retrieveByUserProvider", () => {
    it("retrieves credentials by user-global provider identity", async () => {
      const mockPrepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            credential_id: "cred-1",
            user_id: "user-123",
            workspace_id: "ws-123",
            provider_id: "openai",
            label: "Key 1",
            key_fingerprint: "sk-...1",
            encrypted_secret_json:
              '{"alg":"AES-256-GCM","ciphertext":"","iv":"","tag":"","keyVersion":"v1"}',
            key_version: "v1",
            status: "connected",
            last_validated_at: null,
            last_error_code: null,
            last_error_message: null,
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-02T00:00:00Z",
            deleted_at: null,
          }),
        }),
      });

      mockDb.prepare = mockPrepare;
      repository = new ProviderVaultRepository(mockDb, TEST_MASTER_KEY, "v1");

      const credential = await repository.retrieveByUserProvider(
        "user-123",
        "openai",
      );

      expect(credential?.credentialId).toBe("cred-1");
      expect(mockPrepare.mock.calls[0]?.[0]).toContain("provider_id = ?");
      expect(mockPrepare.mock.calls[0]?.[0]).not.toContain("workspace_id = ?");
    });
  });

  describe("listByUser", () => {
    it("lists credentials for user across workspaces", async () => {
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
                last_validated_at: null,
                last_error_code: null,
                last_error_message: null,
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
                last_validated_at: null,
                last_error_code: null,
                last_error_message: null,
                created_at: "2025-01-02T00:00:00Z",
                updated_at: "2025-01-02T00:00:00Z",
                deleted_at: null,
              },
            ],
          }),
        }),
      });

      mockDb.prepare = mockPrepare;
      repository = new ProviderVaultRepository(mockDb, TEST_MASTER_KEY, "v1");

      const list = await repository.listByUser("user-123");

      expect(list).toHaveLength(2);
      expect(list[0]!.credentialId).toBe("cred-1");
      expect(list[1]!.credentialId).toBe("cred-2");
      expect(mockPrepare.mock.calls[0]?.[0]).not.toContain("workspace_id = ?");
    });

    it("excludes soft-deleted credentials", async () => {
      const mockPrepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      });

      mockDb.prepare = mockPrepare;
      repository = new ProviderVaultRepository(mockDb, TEST_MASTER_KEY, "v1");

      const list = await repository.listByUser("user-123");

      expect(list).toHaveLength(0);
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
      repository = new ProviderVaultRepository(mockDb, TEST_MASTER_KEY, "v1");

      await repository.updateMetadata("cred-123", {
        status: "connected",
        lastValidatedAt: new Date().toISOString(),
        updatedAt: "2025-01-02T00:00:00Z",
      });

      expect(mockRun).toHaveBeenCalled();
      const query = mockPrepare.mock.calls[0]![0];
      expect(query).toContain("UPDATE byok_credentials");
      expect(query).toContain("status");
      expect(query).toContain("last_validated_at");
    });
  });

  describe("softDeleteByUserProvider", () => {
    it("soft deletes credential by user-global provider identity", async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true });
      const mockBind = vi.fn().mockReturnValue({
        run: mockRun,
      });
      const mockPrepare = vi.fn().mockReturnValue({
        bind: mockBind,
      });

      mockDb.prepare = mockPrepare;
      repository = new ProviderVaultRepository(mockDb, TEST_MASTER_KEY, "v1");

      await repository.softDeleteByUserProvider("user-123", "openai", {
        deletedAt: "2025-01-02T00:00:00Z",
        updatedAt: "2025-01-02T00:00:00Z",
      });

      expect(mockRun).toHaveBeenCalled();
      const query = mockPrepare.mock.calls[0]![0];
      expect(query).toContain("deleted_at");
      expect(query).toContain("user_id = ?");
      expect(query).toContain("provider_id = ?");
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
      repository = new ProviderVaultRepository(mockDb, TEST_MASTER_KEY, "v1");

      await expect(
        repository.softDeleteByUserProvider("user-123", "openai", {
          deletedAt: "2025-01-02T00:00:00Z",
          updatedAt: "2025-01-02T00:00:00Z",
        }),
      ).rejects.toThrow("Failed to delete credential");
    });
  });
});
