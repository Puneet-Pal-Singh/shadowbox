/**
 * Encryption Service Tests
 *
 * Tests for real AES-256-GCM credential encryption/decryption.
 */

import { describe, it, expect } from "vitest";
import {
  CredentialEncryptionService,
  EncryptedSecretSchema,
} from "./encryption.js";

describe("CredentialEncryptionService", () => {
  const service = new CredentialEncryptionService();
  const masterKey = "test-master-key-for-encryption-32chars";
  const keyVersion = "v1";

  describe("encrypt", () => {
    it("encrypts plaintext API key with AES-256-GCM", async () => {
      const plaintext = "sk-test-FAKE-KEY-DO-NOT-USE";

      const encrypted = await service.encrypt(plaintext, {
        masterKey,
        keyVersion,
      });

      expect(encrypted.alg).toBe("AES-256-GCM");
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.tag).toBeDefined();
      expect(encrypted.keyVersion).toBe(keyVersion);
    });

    it("produces different ciphertext for same plaintext (due to random IV)", async () => {
      const plaintext = "sk-test-FAKE-KEY-DO-NOT-USE";

      const encrypted1 = await service.encrypt(plaintext, {
        masterKey,
        keyVersion,
      });
      const encrypted2 = await service.encrypt(plaintext, {
        masterKey,
        keyVersion,
      });

      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
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

    it("rejects short master key", async () => {
      await expect(
        service.encrypt("sk-test", {
          masterKey: "short",
          keyVersion: "v1",
        }),
      ).rejects.toThrow("Master key must be at least 32 characters");
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
    it("decrypts encrypted payload back to original plaintext", async () => {
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

    it("round-trips various key formats", async () => {
      const keys = [
        "sk-test-anthropic-key-123456",
        "gsk_abcdefghijklmnopqrstuvwxyz",
        "openai-sk-test-key-abcdefghijk",
        "sk-proj-1234567890abcdefghijklmnop",
      ];

      for (const key of keys) {
        const encrypted = await service.encrypt(key, { masterKey, keyVersion });
        const decrypted = await service.decrypt(encrypted, { masterKey });
        expect(decrypted).toBe(key);
      }
    });

    it("rejects invalid encrypted secret format", async () => {
      const invalid = {
        alg: "AES-256-GCM" as const,
        ciphertext: "",
        iv: "valid",
        tag: "valid",
        keyVersion: "v1",
      };

      await expect(service.decrypt(invalid, { masterKey })).rejects.toThrow(
        "Invalid encrypted secret format",
      );
    });

    it("requires master key for decryption", async () => {
      const encrypted = await service.encrypt("sk-test", {
        masterKey,
        keyVersion,
      });

      await expect(
        service.decrypt(encrypted, { masterKey: "" }),
      ).rejects.toThrow("No master key available for decryption");
    });
  });

  describe("key rotation", () => {
    it("decrypts with previous key after rotation", async () => {
      const plaintext = "sk-test-key-for-rotation";
      const previousKey = "previous-master-key-32-chars-minimum";
      const currentKey = "current-master-key-32-chars-minimum";

      const encrypted = await service.encrypt(plaintext, {
        masterKey: previousKey,
        keyVersion: "v1",
      });

      const decrypted = await service.decrypt(encrypted, {
        masterKey: currentKey,
        previousMasterKey: previousKey,
      });

      expect(decrypted).toBe(plaintext);
    });

    it("fails when no valid key available for decryption", async () => {
      const plaintext = "sk-test-key";
      const wrongKey = "wrong-key-must-be-32-chars-minimum";
      const anotherWrongKey = "another-wrong-key-32-chars-min";

      const encrypted = await service.encrypt(plaintext, {
        masterKey: "original-key-32-chars-minimum-abc",
        keyVersion: "v1",
      });

      await expect(
        service.decrypt(encrypted, {
          masterKey: wrongKey,
          previousMasterKey: anotherWrongKey,
        }),
      ).rejects.toThrow("unable to decrypt with available keys");
    });
  });

  describe("generateFingerprint", () => {
    it("generates fingerprint from API key", () => {
      const key = "sk-test-FAKE-KEY-DO-NOT-USE";
      const fingerprint = service.generateFingerprint(key);

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
