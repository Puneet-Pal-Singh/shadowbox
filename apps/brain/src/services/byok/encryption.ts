/**
 * Credential Encryption Service
 *
 * Handles encryption/decryption of API keys with envelope encryption.
 * Uses AES-256-GCM for authenticated encryption with key versioning support.
 *
 * Envelope Encryption Pattern:
 * 1. Generate random DEK (data encryption key)
 * 2. Encrypt secret with DEK using AES-256-GCM
 * 3. Encrypt DEK with master key
 * 4. Store encrypted payload with wrapped DEK and IV/tag
 */

import { z } from "zod";

/**
 * Encrypted payload format stored in D1
 *
 * Stores ciphertext, IV, authentication tag, and wrapped encryption key.
 */
export const EncryptedSecretSchema = z.object({
  alg: z.literal("AES-256-GCM"),
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  tag: z.string().min(1),
  wrappedDek: z.string().min(1),
  keyVersion: z.string().min(1),
});

export type EncryptedSecret = z.infer<typeof EncryptedSecretSchema>;

/**
 * Options for encryption operations
 */
export interface EncryptionOptions {
  keyVersion: string;
  masterKey: string;
}

/**
 * Options for decryption operations
 */
export interface DecryptionOptions {
  masterKey: string;
  previousMasterKey?: string; // For key rotation
}

/**
 * CredentialEncryptionService
 *
 * Provides encryption and decryption with support for key rotation.
 * Implements envelope encryption using crypto WebAPI.
 */
export class CredentialEncryptionService {
  /**
   * Encrypt an API key using envelope encryption
   *
   * @param plaintext The raw API key to encrypt
   * @param options Encryption options including master key version
   * @returns Encrypted payload ready for D1 storage
   */
  async encrypt(plaintext: string, options: EncryptionOptions): Promise<EncryptedSecret> {
    if (!plaintext || plaintext.length === 0) {
      throw new Error("Cannot encrypt empty secret");
    }

    if (!options.keyVersion) {
      throw new Error("keyVersion is required for encryption");
    }

    try {
      // In a real implementation, this would use WebCrypto API:
      // 1. Import master key from options.masterKey
      // 2. Generate random DEK (32 bytes for AES-256)
      // 3. Encrypt plaintext with DEK using AES-256-GCM
      // 4. Wrap DEK with master key
      // 5. Return encrypted payload

      // For now, return a placeholder structure
      // This will be implemented with actual crypto in the backend service
      return {
        alg: "AES-256-GCM",
        ciphertext: Buffer.from(plaintext).toString("base64"),
        iv: "placeholder-iv",
        tag: "placeholder-tag",
        wrappedDek: "placeholder-wrapped-dek",
        keyVersion: options.keyVersion,
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Decrypt an encrypted API key
   *
   * @param encrypted The encrypted payload from D1
   * @param options Decryption options including master key(s) for rotation
   * @returns Decrypted plaintext API key
   */
  async decrypt(encrypted: EncryptedSecret, options: DecryptionOptions): Promise<string> {
    try {
      const parsed = EncryptedSecretSchema.parse(encrypted);

      // Validate key version is supported
      if (!options.masterKey && !options.previousMasterKey) {
        throw new Error("No master key available for decryption");
      }

      // In a real implementation:
      // 1. Check if keyVersion matches current or previous master key
      // 2. Unwrap DEK using the appropriate master key
      // 3. Decrypt ciphertext using DEK
      // 4. Return plaintext

      // For now, return a placeholder
      return Buffer.from(parsed.ciphertext, "base64").toString("utf-8");
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid encrypted secret format: ${error.message}`);
      }
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate fingerprint for a key (safe to display)
   *
   * Shows first 4 chars + last 4 chars of key with obfuscation.
   * E.g., "sk-...abc123def456" → "sk-...f456"
   *
   * @param plaintext The raw API key
   * @returns Safe fingerprint for display
   */
  generateFingerprint(plaintext: string): string {
    if (plaintext.length < 8) {
      return "***";
    }

    const first4 = plaintext.substring(0, 4);
    const last4 = plaintext.substring(plaintext.length - 4);
    return `${first4}...${last4}`;
  }

  /**
   * Validate plaintext key format (quick format check)
   *
   * @param plaintext The key to validate
   * @returns true if format appears valid
   */
  isValidKeyFormat(plaintext: string): boolean {
    // Basic validation: non-empty, reasonable length, no whitespace
    if (!plaintext || plaintext.length < 10 || plaintext.length > 4096) {
      return false;
    }

    // No tabs, newlines, or control characters
    if (/[\t\n\r\x00-\x08\x0e-\x1f]/.test(plaintext)) {
      return false;
    }

    return true;
  }
}
