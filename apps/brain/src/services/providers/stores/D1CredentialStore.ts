/**
 * D1 Credential Store
 *
 * D1-backed implementation of CredentialStore.
 * Credentials are user-global (keyed by user_id + provider_id).
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { ProviderId } from "@repo/shared-types";
import type {
  CredentialStore,
  ProviderCredentialRecord,
  SetCredentialInput,
} from "./CredentialStore";
import {
  CredentialEncryptionService,
  EncryptedSecret,
} from "../../byok/encryption.js";

interface CredentialRow {
  credential_id: string;
  user_id: string;
  workspace_id: string;
  provider_id: string;
  label: string;
  key_fingerprint: string;
  encrypted_secret_json: string;
  key_version: string;
  status: string;
  last_validated_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export class D1CredentialStore implements CredentialStore {
  private encryption: CredentialEncryptionService;

  constructor(
    private db: D1Database,
    private userId: string,
    private masterKey: string,
    private keyVersion: string,
    private previousMasterKey?: string,
  ) {
    this.encryption = new CredentialEncryptionService();
  }

  async getCredential(
    providerId: ProviderId,
  ): Promise<ProviderCredentialRecord | null> {
    const query = `
      SELECT * FROM byok_credentials
      WHERE user_id = ? AND provider_id = ? AND deleted_at IS NULL
      LIMIT 1
    `;

    const stmt = this.db.prepare(query).bind(this.userId, providerId);
    const row = await stmt.first<CredentialRow>();

    if (!row) {
      return null;
    }

    return this.rowToRecord(row);
  }

  async getCredentialWithKey(
    providerId: ProviderId,
  ): Promise<{ record: ProviderCredentialRecord; apiKey: string } | null> {
    const query = `
      SELECT * FROM byok_credentials
      WHERE user_id = ? AND provider_id = ? AND deleted_at IS NULL
      LIMIT 1
    `;

    const stmt = this.db.prepare(query).bind(this.userId, providerId);
    const row = await stmt.first<CredentialRow>();

    if (!row) {
      return null;
    }

    const encrypted = JSON.parse(row.encrypted_secret_json) as EncryptedSecret;
    const apiKey = await this.encryption.decrypt(encrypted, {
      masterKey: this.masterKey,
      previousMasterKey: this.previousMasterKey,
    });

    return {
      record: this.rowToRecord(row),
      apiKey,
    };
  }

  async setCredential(
    input: SetCredentialInput,
  ): Promise<ProviderCredentialRecord> {
    const credentialId = input.credentialId || crypto.randomUUID();
    const now = new Date().toISOString();

    if (!this.encryption.isValidKeyFormat(input.apiKey)) {
      throw new Error("Invalid API key format");
    }

    const encrypted = await this.encryption.encrypt(input.apiKey, {
      keyVersion: this.keyVersion,
      masterKey: this.masterKey,
    });

    const fingerprint = this.encryption.generateFingerprint(input.apiKey);

    const query = `
      INSERT INTO byok_credentials (
        credential_id, user_id, workspace_id, provider_id, label,
        key_fingerprint, encrypted_secret_json, key_version,
        status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, provider_id, label)
      DO UPDATE SET
        encrypted_secret_json = excluded.encrypted_secret_json,
        key_version = excluded.key_version,
        key_fingerprint = excluded.key_fingerprint,
        status = 'connected',
        updated_at = excluded.updated_at,
        deleted_at = NULL
    `;

    const stmt = this.db
      .prepare(query)
      .bind(
        credentialId,
        this.userId,
        input.workspaceId || "default",
        input.providerId,
        input.label,
        fingerprint,
        JSON.stringify(encrypted),
        this.keyVersion,
        "connected",
        input.createdBy || this.userId,
        now,
        now,
      );

    const result = await stmt.run();
    if (!result.success) {
      throw new Error("Failed to create credential");
    }

    const created = await this.getCredential(input.providerId);
    if (!created) {
      throw new Error("Failed to retrieve created credential");
    }

    return created;
  }

  async deleteCredential(providerId: ProviderId): Promise<void> {
    const now = new Date().toISOString();

    const query = `
      UPDATE byok_credentials
      SET deleted_at = ?, updated_at = ?
      WHERE user_id = ? AND provider_id = ? AND deleted_at IS NULL
    `;

    const stmt = this.db.prepare(query).bind(now, now, this.userId, providerId);
    const result = await stmt.run();

    if (!result.success) {
      throw new Error("Failed to delete credential");
    }
  }

  async listCredentialProviders(): Promise<ProviderId[]> {
    const query = `
      SELECT DISTINCT provider_id FROM byok_credentials
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY provider_id
    `;

    const stmt = this.db.prepare(query).bind(this.userId);
    const result = await stmt.all<{ provider_id: string }>();

    return result.results.map((r) => r.provider_id as ProviderId);
  }

  async updateCredentialMetadata(
    providerId: ProviderId,
    updates: {
      status?: "connected" | "failed" | "revoked";
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

    params.push(this.userId, providerId);

    const query = `
      UPDATE byok_credentials
      SET ${setClauses.join(", ")}
      WHERE user_id = ? AND provider_id = ? AND deleted_at IS NULL
    `;

    const stmt = this.db.prepare(query).bind(...params);
    const result = await stmt.run();

    if (!result.success) {
      throw new Error("Failed to update credential metadata");
    }
  }

  private rowToRecord(row: CredentialRow): ProviderCredentialRecord {
    return {
      credentialId: row.credential_id,
      userId: row.user_id,
      workspaceId: row.workspace_id,
      providerId: row.provider_id as ProviderId,
      label: row.label,
      keyFingerprint: row.key_fingerprint,
      encryptedSecretJson: row.encrypted_secret_json,
      keyVersion: row.key_version,
      status: row.status as "connected" | "failed" | "revoked",
      lastValidatedAt: row.last_validated_at,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }
}
