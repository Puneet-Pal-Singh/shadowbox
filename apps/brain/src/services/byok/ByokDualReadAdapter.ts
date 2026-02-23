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
 * Legacy read contract used during v2->v3 migration.
 */
export interface ILegacyByokReadRepository {
  listCredentials(userId: string, workspaceId: string): Promise<BYOKCredential[]>;
  getCredential(
    credentialId: string,
    userId: string,
    workspaceId: string,
  ): Promise<BYOKCredential | null>;
  getPreferences(userId: string, workspaceId: string): Promise<BYOKPreference | null>;
}

/**
 * V3 Repository contract (placeholder - will be implemented in full)
 */
export interface IProviderVaultRepository {
  listCredentials(userId: string, workspaceId: string): Promise<BYOKCredential[]>;
  getCredential(credentialId: string, userId: string, workspaceId: string): Promise<BYOKCredential | null>;
  getPreferences(userId: string, workspaceId: string): Promise<BYOKPreference | null>;
  createCredential(data: { userId: string; workspaceId: string; providerId: string; secret: string; label?: string }): Promise<BYOKCredential>;
  updateCredential(credentialId: string, userId: string, workspaceId: string, updates: { label?: string; status?: string }): Promise<BYOKCredential>;
  deleteCredential(credentialId: string, userId: string, workspaceId: string): Promise<void>;
  updatePreferences(userId: string, workspaceId: string, updates: Partial<BYOKPreference>): Promise<BYOKPreference>;
}

/**
 * ByokDualReadAdapter - Routes reads between v3 and v2
 */
export class ByokDualReadAdapter {
  private v3Repository: IProviderVaultRepository;
  private enableFallback: boolean;
  private legacyReadRepository: ILegacyByokReadRepository | null;

  constructor(
    v3Repository: IProviderVaultRepository,
    options: {
      enableFallback?: boolean;
      legacyReadRepository?: ILegacyByokReadRepository;
    } = {},
  ) {
    this.v3Repository = v3Repository;
    this.enableFallback = options.enableFallback ?? false;
    this.legacyReadRepository = options.legacyReadRepository ?? null;

    if (this.enableFallback && !this.legacyReadRepository) {
      throw new Error(
        "ByokDualReadAdapter fallback requires legacyReadRepository when enableFallback=true",
      );
    }
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

      if (v3Creds.length > 0 || !this.enableFallback) {
        return {
          credentials: v3Creds,
          source: "v3",
        };
      }

      const fallbackCreds = await this.readV2Credentials(userId, workspaceId);
      return {
        credentials: fallbackCreds,
        source: "v2",
      };
    } catch (error) {
      if (!this.enableFallback) {
        throw error;
      }

      console.warn(
        `[ByokDualReadAdapter] v3 read failed, falling back to v2: ${error instanceof Error ? error.message : String(error)}`
      );

      const fallbackCreds = await this.readV2Credentials(userId, workspaceId);
      return {
        credentials: fallbackCreds,
        source: "v2",
      };
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

      if (v3Prefs || !this.enableFallback) {
        return {
          preferences: v3Prefs,
          source: "v3",
        };
      }

      const fallbackPrefs = await this.readV2Preferences(userId, workspaceId);
      return {
        preferences: fallbackPrefs,
        source: "v2",
      };
    } catch (error) {
      if (!this.enableFallback) {
        throw error;
      }

      console.warn(
        `[ByokDualReadAdapter] v3 preferences read failed, falling back to v2: ${error instanceof Error ? error.message : String(error)}`
      );

      const fallbackPrefs = await this.readV2Preferences(userId, workspaceId);
      return {
        preferences: fallbackPrefs,
        source: "v2",
      };
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

      if (v3Cred || !this.enableFallback) {
        return v3Cred
          ? {
              credential: v3Cred,
              source: "v3",
            }
          : null;
      }

      const fallbackCred = await this.readV2Credential(
        credentialId,
        userId,
        workspaceId,
      );
      return fallbackCred
        ? {
            credential: fallbackCred,
            source: "v2",
          }
        : null;
    } catch (error) {
      if (!this.enableFallback) {
        throw error;
      }

      console.warn(
        `[ByokDualReadAdapter] v3 credential read failed, falling back to v2: ${error instanceof Error ? error.message : String(error)}`
      );

      const fallbackCred = await this.readV2Credential(
        credentialId,
        userId,
        workspaceId,
      );
      return fallbackCred
        ? {
            credential: fallbackCred,
            source: "v2",
          }
        : null;
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

  private getLegacyReadRepository(): ILegacyByokReadRepository {
    if (!this.legacyReadRepository) {
      throw new Error("Legacy BYOK read repository is not configured");
    }
    return this.legacyReadRepository;
  }

  private async readV2Credentials(
    userId: string,
    workspaceId: string,
  ): Promise<BYOKCredential[]> {
    return this.getLegacyReadRepository().listCredentials(userId, workspaceId);
  }

  private async readV2Preferences(
    userId: string,
    workspaceId: string,
  ): Promise<BYOKPreference | null> {
    return this.getLegacyReadRepository().getPreferences(userId, workspaceId);
  }

  private async readV2Credential(
    credentialId: string,
    userId: string,
    workspaceId: string,
  ): Promise<BYOKCredential | null> {
    return this.getLegacyReadRepository().getCredential(
      credentialId,
      userId,
      workspaceId,
    );
  }
}
