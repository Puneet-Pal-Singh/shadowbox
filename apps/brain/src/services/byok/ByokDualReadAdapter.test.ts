/**
 * ByokDualReadAdapter Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ByokDualReadAdapter,
  type IProviderVaultRepository,
  type ILegacyByokReadRepository,
} from "./ByokDualReadAdapter";
import { type BYOKCredential, type BYOKPreference } from "@repo/shared-types";

describe("ByokDualReadAdapter", () => {
  let mockV3Repository: IProviderVaultRepository;
  let mockLegacyReadRepository: ILegacyByokReadRepository;
  let adapter: ByokDualReadAdapter;

  const credentialId = "550e8400-e29b-41d4-a716-446655440000";
  const mockCredential: BYOKCredential = {
    credentialId,
    userId: "user-1",
    workspaceId: "ws-1",
    providerId: "openai",
    label: "Production",
    keyFingerprint: "sk-a...1234",
    encryptedSecretJson: "{\"ciphertext\":\"test\"}",
    keyVersion: "v1",
    status: "connected",
    lastValidatedAt: "2024-02-23T00:00:00Z",
    createdAt: "2024-02-20T00:00:00Z",
    updatedAt: "2024-02-23T00:00:00Z",
    deletedAt: null,
  };

  const mockPreference: BYOKPreference = {
    userId: "user-1",
    workspaceId: "ws-1",
    defaultProviderId: "openai",
    defaultCredentialId: credentialId,
    defaultModelId: "gpt-4",
    fallbackMode: "strict",
    fallbackChain: [],
    updatedAt: "2024-02-23T00:00:00Z",
  };

  beforeEach(() => {
    mockV3Repository = {
      listCredentials: vi.fn(),
      getCredential: vi.fn(),
      getPreferences: vi.fn(),
      createCredential: vi.fn(),
      updateCredential: vi.fn(),
      deleteCredential: vi.fn(),
      updatePreferences: vi.fn(),
    };

    mockLegacyReadRepository = {
      listCredentials: vi.fn(),
      getCredential: vi.fn(),
      getPreferences: vi.fn(),
    };

    adapter = new ByokDualReadAdapter(mockV3Repository, {
      enableFallback: true,
      legacyReadRepository: mockLegacyReadRepository,
    });
  });

  describe("initialization", () => {
    it("creates adapter in strict v3 mode by default", () => {
      const strictAdapter = new ByokDualReadAdapter(mockV3Repository);
      expect(strictAdapter.isFallbackEnabled()).toBe(false);
    });

    it("throws when fallback is enabled without legacy repository", () => {
      expect(
        () =>
          new ByokDualReadAdapter(mockV3Repository, {
            enableFallback: true,
          }),
      ).toThrow("legacyReadRepository");
    });
  });

  describe("getCredentialsWithSource", () => {
    it("returns v3 results when v3 has credentials", async () => {
      vi.mocked(mockV3Repository.listCredentials).mockResolvedValue([
        mockCredential,
      ]);

      const result = await adapter.getCredentialsWithSource("user-1", "ws-1");

      expect(result.source).toBe("v3");
      expect(result.credentials).toHaveLength(1);
      expect(mockLegacyReadRepository.listCredentials).not.toHaveBeenCalled();
    });

    it("falls back to v2 when v3 returns empty and fallback is enabled", async () => {
      vi.mocked(mockV3Repository.listCredentials).mockResolvedValue([]);
      vi.mocked(mockLegacyReadRepository.listCredentials).mockResolvedValue([
        mockCredential,
      ]);

      const result = await adapter.getCredentialsWithSource("user-1", "ws-1");

      expect(result.source).toBe("v2");
      expect(result.credentials).toEqual([mockCredential]);
      expect(mockLegacyReadRepository.listCredentials).toHaveBeenCalledWith(
        "user-1",
        "ws-1",
      );
    });

    it("falls back to v2 when v3 read throws and fallback is enabled", async () => {
      vi.mocked(mockV3Repository.listCredentials).mockRejectedValue(
        new Error("v3 unavailable"),
      );
      vi.mocked(mockLegacyReadRepository.listCredentials).mockResolvedValue([
        mockCredential,
      ]);

      const result = await adapter.getCredentialsWithSource("user-1", "ws-1");

      expect(result.source).toBe("v2");
      expect(result.credentials).toEqual([mockCredential]);
    });
  });

  describe("getPreferencesWithSource", () => {
    it("falls back to v2 when v3 preferences are null", async () => {
      vi.mocked(mockV3Repository.getPreferences).mockResolvedValue(null);
      vi.mocked(mockLegacyReadRepository.getPreferences).mockResolvedValue(
        mockPreference,
      );

      const result = await adapter.getPreferencesWithSource("user-1", "ws-1");

      expect(result.source).toBe("v2");
      expect(result.preferences).toEqual(mockPreference);
    });
  });

  describe("getCredentialWithSource", () => {
    it("falls back to v2 when v3 credential is null", async () => {
      vi.mocked(mockV3Repository.getCredential).mockResolvedValue(null);
      vi.mocked(mockLegacyReadRepository.getCredential).mockResolvedValue(
        mockCredential,
      );

      const result = await adapter.getCredentialWithSource(
        credentialId,
        "user-1",
        "ws-1",
      );

      expect(result?.source).toBe("v2");
      expect(result?.credential).toEqual(mockCredential);
    });
  });
});
