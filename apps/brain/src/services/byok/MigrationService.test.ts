/**
 * ByokBackgroundMigrator Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ByokBackgroundMigrator } from "./MigrationService";
import { CredentialEncryptionService } from "./encryption.js";
import type { IDatabase, BoundStatement, PreparedStatement } from "./repository";

describe("ByokBackgroundMigrator", () => {
  let mockDb: IDatabase;
  let mockEncryption: CredentialEncryptionService;
  let migrator: ByokBackgroundMigrator;

  beforeEach(() => {
    mockEncryption = {
      encrypt: vi.fn().mockReturnValue({
        ciphertext: "encrypted",
        iv: "iv",
        tag: "tag",
        wrappedDek: "dek",
      }),
      decrypt: vi.fn(),
    } as unknown as CredentialEncryptionService;

    // Mock database
    const mockBoundStatement: BoundStatement = {
      all: vi.fn().mockResolvedValue({ results: [] }),
      first: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue({ success: true }),
    };

    const mockPreparedStatement: PreparedStatement = {
      bind: vi.fn().mockReturnValue(mockBoundStatement),
    };

    mockDb = {
      prepare: vi.fn().mockReturnValue(mockPreparedStatement),
    };
  });

  describe("migrate", () => {
    it("should return success when no unmigrated records", async () => {
      const countStatement = {
        bind: vi
          .fn()
          .mockReturnValue({
            first: vi.fn().mockResolvedValue({ count: 0 }),
          } as unknown as BoundStatement),
      } as unknown as PreparedStatement;

      (mockDb.prepare as any).mockImplementation((sql: string) => {
        if (sql.includes("COUNT(*)")) {
          return countStatement;
        }
        return {
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({ results: [] }),
            first: vi.fn().mockResolvedValue(undefined),
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        };
      });

      migrator = new ByokBackgroundMigrator(mockDb, mockEncryption);
      const result = await migrator.migrate();

      expect(result.success).toBe(true);
      expect(result.migratedCount).toBe(0);
      expect(result.totalCount).toBe(0);
    });

    it("should track migration progress", async () => {
      const mockV2Records = [
        {
          id: "cred-1",
          user_id: "user-1",
          workspace_id: "ws-1",
          provider_id: "openai",
          label: "Prod",
          secret: "sk-...",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const countStatement = {
        bind: vi
          .fn()
          .mockReturnValue({
            first: vi.fn().mockResolvedValue({ count: 1 }),
          } as unknown as BoundStatement),
      } as unknown as PreparedStatement;

      const batchStatement = {
        bind: vi
          .fn()
          .mockReturnValue({
            all: vi
              .fn()
              .mockResolvedValue({ results: mockV2Records }),
          } as unknown as BoundStatement),
      } as unknown as PreparedStatement;

      (mockDb.prepare as any).mockImplementation((sql: string) => {
        if (sql.includes("COUNT(*)")) {
          return countStatement;
        }
        if (sql.includes("SELECT")) {
          return batchStatement;
        }
        return {
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({ results: [] }),
            first: vi.fn().mockResolvedValue(undefined),
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        };
      });

      migrator = new ByokBackgroundMigrator(mockDb, mockEncryption);
      const result = await migrator.migrate();

      expect(result.totalCount).toBe(1);
      expect(result.migratedCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });

    it("should handle migration failures gracefully", async () => {
      const mockV2Records = [
        {
          id: "cred-1",
          user_id: "user-1",
          workspace_id: "ws-1",
          provider_id: "openai",
          label: "Prod",
          secret: "sk-...",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const countStatement = {
        bind: vi
          .fn()
          .mockReturnValue({
            first: vi.fn().mockResolvedValue({ count: 1 }),
          } as unknown as BoundStatement),
      } as unknown as PreparedStatement;

      const batchStatement = {
        bind: vi
          .fn()
          .mockReturnValue({
            all: vi
              .fn()
              .mockResolvedValue({ results: mockV2Records }),
          } as unknown as BoundStatement),
      } as unknown as PreparedStatement;

      const failingStatement = {
        bind: vi
          .fn()
          .mockReturnValue({
            run: vi
              .fn()
              .mockRejectedValue(new Error("Insert failed")),
          } as unknown as BoundStatement),
      } as unknown as PreparedStatement;

      (mockDb.prepare as any).mockImplementation((sql: string) => {
        if (sql.includes("COUNT(*)")) {
          return countStatement;
        }
        if (sql.includes("SELECT") && sql.includes("v2_provider_connections")) {
          return batchStatement;
        }
        return failingStatement;
      });

      migrator = new ByokBackgroundMigrator(mockDb, mockEncryption);
      const result = await migrator.migrate();

      expect(result.migratedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.failedIds).toContain("cred-1");
    });
  });

  describe("getProgress", () => {
    it("should return migration progress", async () => {
      const unmigratedStatement = {
        bind: vi
          .fn()
          .mockReturnValue({
            first: vi.fn().mockResolvedValue({ count: 5 }),
          } as unknown as BoundStatement),
      } as unknown as PreparedStatement;

      const totalStatement = {
        bind: vi
          .fn()
          .mockReturnValue({
            first: vi.fn().mockResolvedValue({ count: 10 }),
          } as unknown as BoundStatement),
      } as unknown as PreparedStatement;

      (mockDb.prepare as any).mockImplementation((sql: string) => {
        if (sql.includes("WHERE migrated_at IS NULL")) {
          return unmigratedStatement;
        }
        return totalStatement;
      });

      migrator = new ByokBackgroundMigrator(mockDb, mockEncryption);
      const progress = await migrator.getProgress();

      expect(progress.totalCount).toBe(10);
      expect(progress.migratedCount).toBe(5);
      expect(progress.status).toBe("in_progress");
      expect(progress.completedAt).toBeNull();
    });

    it("should mark as completed when all migrated", async () => {
      const unmigratedStatement = {
        bind: vi
          .fn()
          .mockReturnValue({
            first: vi.fn().mockResolvedValue({ count: 0 }),
          } as unknown as BoundStatement),
      } as unknown as PreparedStatement;

      const totalStatement = {
        bind: vi
          .fn()
          .mockReturnValue({
            first: vi.fn().mockResolvedValue({ count: 10 }),
          } as unknown as BoundStatement),
      } as unknown as PreparedStatement;

      (mockDb.prepare as any).mockImplementation((sql: string) => {
        if (sql.includes("WHERE migrated_at IS NULL")) {
          return unmigratedStatement;
        }
        return totalStatement;
      });

      migrator = new ByokBackgroundMigrator(mockDb, mockEncryption);
      const progress = await migrator.getProgress();

      expect(progress.status).toBe("completed");
      expect(progress.completedAt).not.toBeNull();
    });
  });

  describe("rollback", () => {
    it("should mark all v2 records as unmigrated", async () => {
      const rollbackStatement = {
        bind: vi
          .fn()
          .mockReturnValue({
            run: vi.fn().mockResolvedValue({ success: true }),
          } as unknown as BoundStatement),
      } as unknown as PreparedStatement;

      (mockDb.prepare as any).mockImplementation(() => rollbackStatement);

      migrator = new ByokBackgroundMigrator(mockDb, mockEncryption);
      await expect(migrator.rollback()).resolves.not.toThrow();
    });
  });
});
