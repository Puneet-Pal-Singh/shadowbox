/**
 * BYOK Migration Service
 *
 * Handles v2 -> v3 credential migration with:
 * - Background migration execution
 * - Idempotency to prevent duplicate migrations
 * - Progress tracking for observability
 * - Error handling and retry logic
 */

import type { BoundStatement, IDatabase } from "./repository.js";
import {
  EncryptedSecretSchema,
  type ICredentialEncryptionService,
} from "./encryption.js";

/**
 * Migration progress record
 */
export interface MigrationProgress {
  totalCount: number;
  migratedCount: number;
  failedCount: number;
  failedIds: string[];
  lastBatchSize: number;
  completedAt: string | null;
  status: "pending" | "in_progress" | "completed" | "failed";
}

/**
 * V2 credential record type (legacy)
 */
interface V2CredentialRecord {
  id: string;
  user_id: string;
  workspace_id: string;
  provider_id: string;
  label?: string;
  secret: string;
  created_at: string;
  updated_at: string;
  migrated_at?: string;
}

export interface MigrationCryptoConfig {
  targetMasterKey: string;
  targetKeyVersion: string;
  legacyMasterKey?: string;
  legacyPreviousMasterKey?: string;
}

/**
 * Migration result
 */
export interface MigrationResult {
  success: boolean;
  migratedCount: number;
  failedCount: number;
  totalCount: number;
  failedIds: string[];
  durationMs: number;
  errorMessage?: string;
}

interface MigrationBatchProgress {
  migratedCount: number;
  failedCount: number;
  failedIds: string[];
  runFailed: boolean;
}

/**
 * ByokBackgroundMigrator - Migrates v2 credentials to v3 format
 */
export class ByokBackgroundMigrator {
  private static readonly PLACEHOLDER_MASTER_KEY =
    "migration-placeholder-master-key";

  private db: IDatabase;
  private encryptionService: ICredentialEncryptionService;
  private batchSize: number;
  private cryptoConfig: MigrationCryptoConfig;
  private completedAt: string | null = null;
  private lastFailedCount = 0;
  private lastFailedIds: string[] = [];
  private lastRunFailed = false;

  constructor(
    db: IDatabase,
    encryptionService: ICredentialEncryptionService,
    batchSize: number = 100,
    cryptoConfig?: MigrationCryptoConfig,
  ) {
    this.db = db;
    this.encryptionService = encryptionService;
    this.batchSize = batchSize;
    this.cryptoConfig = this.validateCryptoConfig(cryptoConfig);
  }

  /**
   * Execute background migration
   * Fetches unmigrated v2 records and converts to v3.
   */
  async migrate(): Promise<MigrationResult> {
    const startTime = Date.now();
    const progress: MigrationBatchProgress = this.createInitialProgress();
    let totalCount = 0;

    this.resetRunState();

    try {
      console.log("[ByokBackgroundMigrator] Starting migration");

      totalCount = await this.getUnmigratedCount();
      if (totalCount === 0) {
        console.log("[ByokBackgroundMigrator] No unmigrated records found");
        return this.buildNoRecordsResult(startTime);
      }

      console.log(
        `[ByokBackgroundMigrator] Found ${totalCount} unmigrated records`,
      );

      await this.processBatches(progress);
      return this.buildSuccessResult(progress, totalCount, startTime);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[ByokBackgroundMigrator] Migration failed: ${errorMessage}`);
      return this.buildFailureResult(progress, totalCount, errorMessage, startTime);
    }
  }

  /**
   * Migrate a single v2 record to v3.
   */
  private async migrateRecord(v2Record: V2CredentialRecord): Promise<void> {
    const plaintext = await this.resolveLegacySecret(v2Record.secret);
    const encrypted = await this.encryptionService.encrypt(plaintext, {
      keyVersion: this.cryptoConfig.targetKeyVersion,
      masterKey: this.cryptoConfig.targetMasterKey,
    });
    const keyFingerprint = this.encryptionService.generateFingerprint(plaintext);
    const migratedAt = new Date().toISOString();

    const insertStatement = this.db
      .prepare(
        `
        INSERT INTO byok_credentials (
          credential_id, user_id, workspace_id, provider_id, label,
          key_fingerprint, encrypted_secret_json, key_version, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(credential_id) DO NOTHING
      `,
      )
      .bind(
        v2Record.id,
        v2Record.user_id,
        v2Record.workspace_id,
        v2Record.provider_id,
        v2Record.label || "Migrated from v2",
        keyFingerprint,
        JSON.stringify(encrypted),
        encrypted.keyVersion,
        "connected",
        v2Record.created_at,
        v2Record.updated_at,
      );

    const updateStatement = this.db
      .prepare("UPDATE v2_provider_connections SET migrated_at = ? WHERE id = ?")
      .bind(migratedAt, v2Record.id);

    await this.runAtomicMigrationStatements(insertStatement, updateStatement);

    console.log(`[ByokBackgroundMigrator] Migrated credential ${v2Record.id}`);
  }

  /**
   * Check migration status.
   */
  async getProgress(): Promise<MigrationProgress> {
    const unmigratedCount = await this.getUnmigratedCount();
    const totalCount = await this.getTotalCount();
    const migratedCount = totalCount - unmigratedCount;

    return {
      totalCount,
      migratedCount,
      failedCount: this.lastFailedCount,
      failedIds: [...this.lastFailedIds],
      lastBatchSize: this.batchSize,
      completedAt: unmigratedCount === 0 ? this.completedAt : null,
      status: this.resolveStatus(totalCount, unmigratedCount, migratedCount),
    };
  }

  /**
   * Rollback migration (for emergency only).
   */
  async rollback(): Promise<void> {
    console.warn(
      "[ByokBackgroundMigrator] ROLLBACK: Marking all v3 records as unmigrated",
    );

    await this.db
      .prepare(
        `
        DELETE FROM byok_credentials
        WHERE credential_id IN (
          SELECT id
          FROM v2_provider_connections
          WHERE migrated_at IS NOT NULL
        )
      `,
      )
      .bind()
      .run();

    await this.db
      .prepare(
        "UPDATE v2_provider_connections SET migrated_at = NULL WHERE migrated_at IS NOT NULL",
      )
      .bind()
      .run();

    this.completedAt = null;
    this.lastRunFailed = false;
  }

  private async getUnmigratedCount(): Promise<number> {
    const countResult = await this.db
      .prepare(
        "SELECT COUNT(*) as count FROM v2_provider_connections WHERE migrated_at IS NULL",
      )
      .bind()
      .first<{ count: number }>();
    return countResult?.count ?? 0;
  }

  private async getTotalCount(): Promise<number> {
    const total = await this.db
      .prepare("SELECT COUNT(*) as count FROM v2_provider_connections")
      .bind()
      .first<{ count: number }>();
    return total?.count ?? 0;
  }

  private async fetchUnmigratedBatch(): Promise<V2CredentialRecord[]> {
    const batch = await this.db
      .prepare(
        `
        SELECT
          id, user_id, workspace_id, provider_id, label, secret, created_at, updated_at
        FROM v2_provider_connections
        WHERE migrated_at IS NULL
        LIMIT ? OFFSET 0
      `,
      )
      .bind(this.batchSize)
      .all<V2CredentialRecord>();

    return batch.results ?? [];
  }

  private async resolveLegacySecret(secret: string): Promise<string> {
    const maybeEncrypted = this.parseEncryptedSecret(secret);
    if (!maybeEncrypted) {
      return secret;
    }

    if (!this.cryptoConfig.legacyMasterKey) {
      throw new Error(
        "Legacy encrypted secret detected but legacyMasterKey is not configured",
      );
    }

    return this.encryptionService.decrypt(maybeEncrypted, {
      masterKey: this.cryptoConfig.legacyMasterKey,
      previousMasterKey: this.cryptoConfig.legacyPreviousMasterKey,
    });
  }

  private parseEncryptedSecret(secret: string) {
    try {
      const parsed = JSON.parse(secret) as unknown;
      const result = EncryptedSecretSchema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }

  private async runAtomicMigrationStatements(
    insertStatement: BoundStatement,
    updateStatement: BoundStatement,
  ): Promise<void> {
    if (this.db.batch) {
      await this.db.batch([insertStatement, updateStatement]);
      return;
    }

    await insertStatement.run();
    await updateStatement.run();
  }

  private validateCryptoConfig(
    cryptoConfig?: MigrationCryptoConfig,
  ): MigrationCryptoConfig {
    if (!cryptoConfig) {
      throw new Error(
        "Migration crypto configuration is required for ByokBackgroundMigrator",
      );
    }

    if (
      !cryptoConfig.targetMasterKey ||
      cryptoConfig.targetMasterKey ===
        ByokBackgroundMigrator.PLACEHOLDER_MASTER_KEY
    ) {
      throw new Error(
        "Migration target master key is invalid. Configure a non-placeholder key.",
      );
    }

    if (!cryptoConfig.targetKeyVersion) {
      throw new Error(
        "Migration target key version is required for ByokBackgroundMigrator",
      );
    }

    return cryptoConfig;
  }

  private createInitialProgress(): MigrationBatchProgress {
    return {
      migratedCount: 0,
      failedCount: 0,
      failedIds: [],
      runFailed: false,
    };
  }

  private resetRunState(): void {
    this.completedAt = null;
    this.lastRunFailed = false;
  }

  private buildNoRecordsResult(startTime: number): MigrationResult {
    this.lastFailedCount = 0;
    this.lastFailedIds = [];
    this.completedAt = new Date().toISOString();

    return {
      success: true,
      migratedCount: 0,
      failedCount: 0,
      totalCount: 0,
      failedIds: [],
      durationMs: Date.now() - startTime,
    };
  }

  private buildSuccessResult(
    progress: MigrationBatchProgress,
    totalCount: number,
    startTime: number,
  ): MigrationResult {
    const durationMs = Date.now() - startTime;
    this.completedAt = new Date().toISOString();
    this.lastFailedCount = progress.failedCount;
    this.lastFailedIds = [...progress.failedIds];
    this.lastRunFailed = progress.runFailed;

    console.log(
      `[ByokBackgroundMigrator] Migration complete: ${progress.migratedCount} migrated, ${progress.failedCount} failed in ${durationMs}ms`,
    );

    return {
      success: progress.failedCount === 0 && !this.lastRunFailed,
      migratedCount: progress.migratedCount,
      failedCount: progress.failedCount,
      totalCount,
      failedIds: [...progress.failedIds],
      durationMs,
    };
  }

  private buildFailureResult(
    progress: MigrationBatchProgress,
    totalCount: number,
    errorMessage: string,
    startTime: number,
  ): MigrationResult {
    const durationMs = Date.now() - startTime;
    this.lastRunFailed = true;
    this.lastFailedCount = progress.failedCount;
    this.lastFailedIds = [...progress.failedIds];

    return {
      success: false,
      migratedCount: progress.migratedCount,
      failedCount: progress.failedCount,
      totalCount,
      failedIds: [...progress.failedIds],
      durationMs,
      errorMessage,
    };
  }

  private async processBatches(progress: MigrationBatchProgress): Promise<void> {
    while (true) {
      const batch = await this.fetchUnmigratedBatch();
      if (batch.length === 0) {
        return;
      }

      console.log(
        `[ByokBackgroundMigrator] Processing batch size: ${batch.length}`,
      );

      let batchMigratedCount = 0;
      for (const v2Record of batch) {
        try {
          await this.migrateRecord(v2Record);
          progress.migratedCount++;
          batchMigratedCount++;
        } catch (error) {
          progress.failedCount++;
          progress.failedIds.push(v2Record.id);
          console.error(
            `[ByokBackgroundMigrator] Failed to migrate ${v2Record.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      console.log(
        `[ByokBackgroundMigrator] Progress: ${progress.migratedCount} migrated, ${progress.failedCount} failed`,
      );

      if (batchMigratedCount === 0) {
        progress.runFailed = true;
        console.warn(
          "[ByokBackgroundMigrator] Stopping migration: batch produced no successful migrations",
        );
        return;
      }
    }
  }

  private resolveStatus(
    totalCount: number,
    unmigratedCount: number,
    migratedCount: number,
  ): MigrationProgress["status"] {
    if (totalCount === 0 || unmigratedCount === 0) {
      return "completed";
    }

    if (this.lastRunFailed) {
      return "failed";
    }

    if (migratedCount === 0) {
      return "pending";
    }

    return "in_progress";
  }
}
