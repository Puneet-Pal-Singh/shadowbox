/**
 * BYOK Dual-Read Adapter
 *
 * Routes reads between v3 (primary) and v2 (fallback) during migration.
 * All writes go to v3 only.
 * Tracks read source for observability and migration progress.
 *
 * This adapter is active when BYOK_V3_ENABLED=true && BYOK_MIGRATION_CUTOVER=false.
 * - When BYOK_MIGRATION_CUTOVER=true, reads v3 only.
 * - When BYOK_V3_ENABLED=false, reads/writes v2 only.
 */

import { BYOKCredential, BYOKPreference } from "@repo/shared-types";
import { ProviderVaultRepository } from "./repository.js";
import type { IDatabase } from "./repository.js";

/**
 * Read source tracking for observability
 */
export type ReadSource = "v3" | "v2";

/**
 * Credentials read with source tracking
 */
export interface CredentialsWithSource {
  credentials: BYOKCredential[];
  source: ReadSource;
}

export interface PreferencesWithSource {
  preferences: BYOKPreference | null;
  source: ReadSource;
}

/**
 * ByokDualReadAdapter - Routes reads between v3 and v2
 */
export class ByokDualReadAdapter {
  private v3Repository: ProviderVaultRepository;
  private enableFallback: boolean;

  constructor(
    db: IDatabase,
    options: { enableFallback: boolean } = { enableFallback: true }
  ) {
    this.v3Repository = new ProviderVaultRepository(db);
    this.enableFallback = options.enableFallback;
  }

  /**
   * Get credentials with source tracking
   * Tries v3 first, falls back to v2 if needed
   */
  async getCredentialsWithSource(
    userId: string,
    workspaceId: string
  ): Promise<CredentialsWithSource> {
    try {
      // Try v3 first
      const v3Creds = await this.v3Repository.listCredentials(
        userId,
        workspaceId
      );

      return {
        credentials: v3Creds,
        source: "v3",
      };
    } catch (error) {
      if (!this.enableFallback) {
        throw error;
      }

      console.warn(
        `[ByokDualReadAdapter] v3 read failed, falling back to v2: ${error instanceof Error ? error.message : String(error)}`
      );

      // In migration phase, v2 fallback would be implemented here
      // For now, we throw (v2 path not yet migrated)
      throw new Error(
        "v2 fallback not yet implemented; please enable v3 only migration"
      );
    }
  }

  /**
   * Get preferences with source tracking
   * Tries v3 first, falls back to v2 if needed
   */
  async getPreferencesWithSource(
    userId: string,
    workspaceId: string
  ): Promise<PreferencesWithSource> {
    try {
      // Try v3 first
      const v3Prefs = await this.v3Repository.getPreferences(
        userId,
        workspaceId
      );

      return {
        preferences: v3Prefs,
        source: "v3",
      };
    } catch (error) {
      if (!this.enableFallback) {
        throw error;
      }

      console.warn(
        `[ByokDualReadAdapter] v3 preferences read failed, falling back to v2: ${error instanceof Error ? error.message : String(error)}`
      );

      // v2 fallback (to be implemented in migration phase)
      throw new Error(
        "v2 fallback not yet implemented; please enable v3 only migration"
      );
    }
  }

  /**
   * Get single credential by ID with source tracking
   */
  async getCredentialWithSource(
    credentialId: string,
    userId: string,
    workspaceId: string
  ): Promise<{ credential: BYOKCredential; source: ReadSource } | null> {
    try {
      const v3Cred = await this.v3Repository.getCredential(
        credentialId,
        userId,
        workspaceId
      );

      return v3Cred
        ? {
            credential: v3Cred,
            source: "v3",
          }
        : null;
    } catch (error) {
      if (!this.enableFallback) {
        throw error;
      }

      console.warn(
        `[ByokDualReadAdapter] v3 credential read failed, falling back to v2: ${error instanceof Error ? error.message : String(error)}`
      );

      // v2 fallback (to be implemented in migration phase)
      throw new Error(
        "v2 fallback not yet implemented; please enable v3 only migration"
      );
    }
  }

  /**
   * Connect credential (write-to-v3-only)
   */
  async connectCredential(
    userId: string,
    workspaceId: string,
    providerId: string,
    secret: string,
    label?: string
  ): Promise<BYOKCredential> {
    // Always write to v3
    return this.v3Repository.createCredential({
      userId,
      workspaceId,
      providerId,
      secret,
      label,
    });
  }

  /**
   * Update credential (write-to-v3-only)
   */
  async updateCredential(
    credentialId: string,
    userId: string,
    workspaceId: string,
    updates: { label?: string; status?: string }
  ): Promise<BYOKCredential> {
    // Always write to v3
    return this.v3Repository.updateCredential(
      credentialId,
      userId,
      workspaceId,
      updates
    );
  }

  /**
   * Disconnect credential (write-to-v3-only)
   */
  async disconnectCredential(
    credentialId: string,
    userId: string,
    workspaceId: string
  ): Promise<void> {
    // Always write to v3
    return this.v3Repository.deleteCredential(
      credentialId,
      userId,
      workspaceId
    );
  }

  /**
   * Update preferences (write-to-v3-only)
   */
  async updatePreferences(
    userId: string,
    workspaceId: string,
    updates: Partial<BYOKPreference>
  ): Promise<BYOKPreference> {
    // Always write to v3
    return this.v3Repository.updatePreferences(
      userId,
      workspaceId,
      updates
    );
  }

  /**
   * Check if fallback is enabled (for testing/observability)
   */
  isFallbackEnabled(): boolean {
    return this.enableFallback;
  }
}
