import { describe, expect, it } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import { D1CredentialStore } from "./D1CredentialStore";

interface PreparedStatement {
  bind(...params: unknown[]): {
    first<T = unknown>(): Promise<T | undefined>;
    run(): Promise<{ success: boolean }>;
  };
}

describe("D1CredentialStore", () => {
  it("matches the active-row partial unique index during credential upsert", async () => {
    let insertSql = "";
    let storedRow: Record<string, unknown> | undefined;

    const database: D1Database = {
      prepare(sql: string): PreparedStatement {
        return {
          bind(...params: unknown[]) {
            return {
              async first<T = unknown>(): Promise<T | undefined> {
                if (
                  sql.includes("SELECT * FROM byok_credentials") &&
                  storedRow
                ) {
                  return storedRow as T;
                }
                return undefined;
              },
              async run(): Promise<{ success: boolean }> {
                if (sql.includes("INSERT INTO byok_credentials")) {
                  insertSql = sql;
                  storedRow = {
                    credential_id: params[0],
                    user_id: params[1],
                    workspace_id: params[2],
                    provider_id: params[3],
                    label: params[4],
                    key_fingerprint: params[5],
                    encrypted_secret_json: params[6],
                    key_version: params[7],
                    status: params[8],
                    last_validated_at: null,
                    last_error_code: null,
                    last_error_message: null,
                    created_at: params[10],
                    updated_at: params[11],
                    deleted_at: null,
                  };
                }
                return { success: true };
              },
            };
          },
        };
      },
    } as D1Database;

    const store = new D1CredentialStore(
      database,
      "dogfood-user",
      "12345678901234567890123456789012",
      "v1",
    );

    await store.setCredential({
      credentialId: "cred-openai",
      userId: "dogfood-user",
      workspaceId: "default",
      providerId: "openai",
      label: "default",
      apiKey: "sk-test-openai-1234567890",
      createdBy: "dogfood-user",
    });

    expect(insertSql).toContain("ON CONFLICT(user_id, provider_id, label)");
    expect(insertSql).toContain("WHERE deleted_at IS NULL");
  });
});
