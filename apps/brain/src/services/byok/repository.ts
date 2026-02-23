/**
 * BYOK Credential Repository
 *
 * Data access layer for D1-backed credential storage.
 * Provides CRUD operations with encryption/decryption boundaries.
 *
 * Never exposes plaintext secrets outside of create/decrypt operations.
 */

import { BYOKCredential, BYOKCredentialDTO } from "@repo/shared-types";
import { CredentialEncryptionService, EncryptedSecret } from "./encryption.js";

/**
 * Repository query interface (platform-agnostic)
 */
export interface IDatabase {
  prepare(sql: string): PreparedStatement;
}

export interface PreparedStatement {
  bind(...params: unknown[]): BoundStatement;
}

export interface BoundStatement {
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = unknown>(): Promise<T | undefined>;
  run(): Promise<{ success: boolean }>;
}

/**
 * ProviderVaultRepository
 *
 * Manages credential lifecycle in D1:
 * - Create (with encryption)
 * - Read (with decryption)
 * - Update metadata (status, last validated)
 * - Delete (soft delete)
 * - List (by scope)
 */
export class ProviderVaultRepository {
  private encryption: CredentialEncryptionService;

  constructor(
    private db: IDatabase,
    private masterKey: string,
    private keyVersion: string,
  ) {
    this.encryption = new CredentialEncryptionService();
  }

  /**
   * Create a new credential with encrypted secret
   *
   * @param credential Credential data with plaintext apiKey
   * @param plaintext The raw API key to encrypt
   * @returns Created credential (without plaintext)
   */
  async create(
    credential: Omit<BYOKCredential, "encryptedSecretJson" | "keyVersion">,
    plaintext: string,
  ): Promise<BYOKCredentialDTO> {
    // Validate plaintext key format
    if (!this.encryption.isValidKeyFormat(plaintext)) {
      throw new Error("Invalid API key format");
    }

    // Encrypt the plaintext secret
    const encrypted = await this.encryption.encrypt(plaintext, {
      keyVersion: this.keyVersion,
      masterKey: this.masterKey,
    });

    // Insert into D1
    const query = `
      INSERT INTO byok_credentials (
        credential_id, user_id, workspace_id, provider_id, label,
        key_fingerprint, encrypted_secret_json, key_version,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const stmt = this.db.prepare(query).bind(
      credential.credentialId,
      credential.userId,
      credential.workspaceId,
      credential.providerId,
      credential.label,
      credential.keyFingerprint,
      JSON.stringify(encrypted),
      this.keyVersion,
      credential.status,
      credential.createdAt,
      credential.updatedAt,
    );

    const result = await stmt.run();
    if (!result.success) {
      throw new Error("Failed to create credential");
    }

    // Return DTO (no plaintext, no encrypted secret)
    return this.toDTO(credential);
  }

  /**
   * Retrieve a credential (with decryption available)
   *
   * @param credentialId The credential to fetch
   * @param options Options including decryption master keys
   * @returns Credential with decrypted secret
   */
  async retrieve(
    credentialId: string,
    options?: { includePlaintext?: boolean },
  ): Promise<BYOKCredential | BYOKCredentialDTO | null> {
    const query = `
      SELECT * FROM byok_credentials
      WHERE credential_id = ? AND deleted_at IS NULL
      LIMIT 1
    `;

    const stmt = this.db.prepare(query).bind(credentialId);
    const row = await stmt.first<any>();

    if (!row) {
      return null;
    }

    // If plaintext is requested, decrypt
    if (options?.includePlaintext) {
      const encrypted = JSON.parse(row.encrypted_secret_json) as EncryptedSecret;
      const plaintext = await this.encryption.decrypt(encrypted, {
        masterKey: this.masterKey,
      });

      return {
        ...row,
        encryptedSecretJson: row.encrypted_secret_json,
        keyVersion: row.key_version,
        plaintext, // Not part of schema, but useful for service layer
      };
    }

    // Return as DTO (no plaintext or encryption details)
    return this.toDTO(row);
  }

  /**
   * List credentials for a workspace
   *
   * @param userId User ID
   * @param workspaceId Workspace ID
   * @returns List of credential DTOs (no plaintext)
   */
  async listByWorkspace(userId: string, workspaceId: string): Promise<BYOKCredentialDTO[]> {
    const query = `
      SELECT
        credential_id, user_id, workspace_id, provider_id, label,
        key_fingerprint, status, last_validated_at, last_error_code,
        last_error_message, created_at, updated_at
      FROM byok_credentials
      WHERE user_id = ? AND workspace_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;

    const stmt = this.db.prepare(query).bind(userId, workspaceId);
    const rows = await stmt.all<any>();

    return rows.results.map((row) => this.toDTO(row));
  }

  /**
   * Update credential metadata (status, last validated, errors)
   *
   * @param credentialId The credential to update
   * @param updates Partial updates (status, lastValidatedAt, lastError, etc.)
   */
  async updateMetadata(
    credentialId: string,
    updates: {
      status?: string;
      lastValidatedAt?: string;
      lastErrorCode?: string;
      lastErrorMessage?: string;
    },
  ): Promise<void> {
    const setClauses: string[] = ["updated_at = ?"];
    const params: unknown[] = [new Date().toISOString()];

    if (updates.status) {
      setClauses.push("status = ?");
      params.push(updates.status);
    }
    if (updates.lastValidatedAt) {
      setClauses.push("last_validated_at = ?");
      params.push(updates.lastValidatedAt);
    }
    if (updates.lastErrorCode !== undefined) {
      setClauses.push("last_error_code = ?");
      params.push(updates.lastErrorCode);
    }
    if (updates.lastErrorMessage !== undefined) {
      setClauses.push("last_error_message = ?");
      params.push(updates.lastErrorMessage);
    }

    params.push(credentialId);

    const query = `
      UPDATE byok_credentials
      SET ${setClauses.join(", ")}
      WHERE credential_id = ? AND deleted_at IS NULL
    `;

    const stmt = this.db.prepare(query).bind(...params);
    const result = await stmt.run();

    if (!result.success) {
      throw new Error("Failed to update credential metadata");
    }
  }

  /**
   * Soft delete a credential
   *
   * @param credentialId The credential to delete
   */
  async delete(credentialId: string): Promise<void> {
    const query = `
      UPDATE byok_credentials
      SET deleted_at = ?, updated_at = ?
      WHERE credential_id = ? AND deleted_at IS NULL
    `;

    const now = new Date().toISOString();
    const stmt = this.db.prepare(query).bind(now, now, credentialId);
    const result = await stmt.run();

    if (!result.success) {
      throw new Error("Failed to delete credential");
    }
  }

  /**
   * Convert internal row to DTO (excludes secrets and encryption details)
   */
  private toDTO(row: any): BYOKCredentialDTO {
    return {
      credentialId: row.credential_id,
      userId: row.user_id,
      workspaceId: row.workspace_id,
      providerId: row.provider_id,
      label: row.label,
      keyFingerprint: row.key_fingerprint,
      status: row.status,
      lastValidatedAt: row.last_validated_at,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }
}
