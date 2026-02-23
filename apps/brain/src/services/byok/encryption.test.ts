/**
 * Encryption Service Tests
 *
 * Tests for credential encryption/decryption with key versioning.
 */

import { describe, it, expect } from "vitest";
import {
  CredentialEncryptionService,
  EncryptedSecretSchema,
} from "./encryption.js";

describe("CredentialEncryptionService", () => {
  const service = new CredentialEncryptionService();
  const masterKey = "test-master-key-do-not-use";
  const keyVersion = "v1";

  describe("encrypt", () => {
    it("encrypts plaintext API key", async () => {
      const plaintext = "sk-test-FAKE-KEY-DO-NOT-USE";

      const encrypted = await service.encrypt(plaintext, {
        masterKey,
        keyVersion,
      });

      expect(encrypted.alg).toBe("AES-256-GCM");
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.tag).toBeDefined();
      expect(encrypted.wrappedDek).toBeDefined();
      expect(encrypted.keyVersion).toBe(keyVersion);
    });

    it("rejects empty plaintext", async () => {
      await expect(
        service.encrypt("", {
          masterKey,
          keyVersion,
        }),
      ).rejects.toThrow("Cannot encrypt empty secret");
    });

    it("requires key version", async () => {
      await expect(
        service.encrypt("sk-test", {
          masterKey,
          keyVersion: "",
        }),
      ).rejects.toThrow("keyVersion is required");
    });

    it("returns valid EncryptedSecret schema", async () => {
      const encrypted = await service.encrypt("sk-test-FAKE", {
        masterKey,
        keyVersion,
      });

      const result = EncryptedSecretSchema.safeParse(encrypted);
      expect(result.success).toBe(true);
    });
  });

  describe("decrypt", () => {
    it("decrypts encrypted payload", async () => {
      const plaintext = "sk-test-FAKE-KEY-DO-NOT-USE";

      const encrypted = await service.encrypt(plaintext, {
        masterKey,
        keyVersion,
      });

      const decrypted = await service.decrypt(encrypted, {
        masterKey,
      });

      expect(decrypted).toBe(plaintext);
    });

    it("rejects invalid encrypted secret format", async () => {
      const invalid = {
        alg: "AES-256-GCM" as const,
        ciphertext: "",
        iv: "valid",
        tag: "valid",
        wrappedDek: "valid",
        keyVersion,
      };

      await expect(
        service.decrypt(invalid, { masterKey }),
      ).rejects.toThrow("Invalid encrypted secret format");
    });

    it("requires master key for decryption", async () => {
      const encrypted = await service.encrypt("sk-test", {
        masterKey,
        keyVersion,
      });

      await expect(
        service.decrypt(encrypted, {}),
      ).rejects.toThrow("No master key available");
    });
  });

  describe("generateFingerprint", () => {
    it("generates fingerprint from API key", () => {
      const key = "sk-test-FAKE-KEY-DO-NOT-USE";
      const fingerprint = service.generateFingerprint(key);

      // Format: first4...last4
      expect(fingerprint).toContain("sk-t");
      expect(fingerprint).toContain("...");
      expect(fingerprint).toContain("USE");
    });

    it("handles short keys", () => {
      const fingerprint = service.generateFingerprint("short");
      expect(fingerprint).toBe("***");
    });

    it("shows first and last 4 chars", () => {
      const key = "1234567890";
      const fingerprint = service.generateFingerprint(key);

      expect(fingerprint).toContain("1234");
      expect(fingerprint).toContain("...");
      expect(fingerprint).toContain("7890");
    });
  });

  describe("isValidKeyFormat", () => {
    it("accepts valid API keys", () => {
      expect(service.isValidKeyFormat("sk-test-FAKE-KEY-DO-NOT-USE")).toBe(
        true,
      );
      expect(service.isValidKeyFormat("gsk_abcdef123456")).toBe(true);
      expect(service.isValidKeyFormat("a".repeat(100))).toBe(true);
    });

    it("rejects empty key", () => {
      expect(service.isValidKeyFormat("")).toBe(false);
    });

    it("rejects too-short key", () => {
      expect(service.isValidKeyFormat("short")).toBe(false);
    });

    it("rejects too-long key (> 4096)", () => {
      expect(service.isValidKeyFormat("a".repeat(5000))).toBe(false);
    });

    it("rejects keys with control characters", () => {
      expect(service.isValidKeyFormat("sk-test\nkey")).toBe(false);
      expect(service.isValidKeyFormat("sk-test\tkey")).toBe(false);
      expect(service.isValidKeyFormat("sk-test\x00key")).toBe(false);
    });
  });
});
