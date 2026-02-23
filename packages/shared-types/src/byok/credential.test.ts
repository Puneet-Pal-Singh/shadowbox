import { describe, it, expect } from "vitest";
import {
  BYOKCredentialSchema,
  BYOKCredentialDTOSchema,
} from "./credential.js";

describe("BYOK Credential Entity", () => {
  it("validates credential with all fields", () => {
    const credential = {
      credentialId: "550e8400-e29b-41d4-a716-446655440000",
      userId: "user123",
      workspaceId: "workspace456",
      providerId: "openai",
      label: "My OpenAI Key",
      keyFingerprint: "sk-...abc123",
      encryptedSecretJson: '{"alg":"AES-256-GCM","ciphertext":"..."}',
      keyVersion: "v1",
      status: "connected" as const,
      lastValidatedAt: "2025-02-23T10:00:00Z",
      createdAt: "2025-02-23T10:00:00Z",
      updatedAt: "2025-02-23T10:00:00Z",
    };

    const result = BYOKCredentialSchema.safeParse(credential);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.providerId).toBe("openai");
      expect(result.data.status).toBe("connected");
    }
  });

  it("rejects credential with invalid UUID", () => {
    const credential = {
      credentialId: "invalid-uuid",
      userId: "user123",
      workspaceId: "workspace456",
      providerId: "openai",
      label: "My OpenAI Key",
      keyFingerprint: "sk-...abc123",
      encryptedSecretJson: '{"alg":"AES-256-GCM","ciphertext":"..."}',
      keyVersion: "v1",
      createdAt: "2025-02-23T10:00:00Z",
      updatedAt: "2025-02-23T10:00:00Z",
    };

    const result = BYOKCredentialSchema.safeParse(credential);
    expect(result.success).toBe(false);
  });

  it("credential DTO excludes encryption details", () => {
    const credentialDTO = {
      credentialId: "550e8400-e29b-41d4-a716-446655440000",
      userId: "user123",
      workspaceId: "workspace456",
      providerId: "openai",
      label: "My OpenAI Key",
      keyFingerprint: "sk-...abc123",
      status: "connected" as const,
      createdAt: "2025-02-23T10:00:00Z",
      updatedAt: "2025-02-23T10:00:00Z",
    };

    const result = BYOKCredentialDTOSchema.safeParse(credentialDTO);
    expect(result.success).toBe(true);
  });

  it("credential DTO does not include encrypted fields in parsed output", () => {
    const credentialDTO = {
      credentialId: "550e8400-e29b-41d4-a716-446655440000",
      userId: "user123",
      workspaceId: "workspace456",
      providerId: "openai",
      label: "My OpenAI Key",
      keyFingerprint: "sk-...abc123",
      encryptedSecretJson: '{"alg":"AES-256-GCM","ciphertext":"..."}',
      status: "connected" as const,
      createdAt: "2025-02-23T10:00:00Z",
      updatedAt: "2025-02-23T10:00:00Z",
    };

    const result = BYOKCredentialDTOSchema.safeParse(credentialDTO);
    expect(result.success).toBe(true);
    if (result.success) {
      // Verify encrypted fields are not in the parsed result
      expect("encryptedSecretJson" in result.data).toBe(false);
      expect("keyVersion" in result.data).toBe(false);
    }
  });
});
