/**
 * Credential Encryption Service
 *
 * Handles encryption/decryption of API keys with AES-256-GCM authenticated encryption.
 * Supports key versioning for rotation.
 *
 * Security: This implements proper authenticated encryption - not a placeholder.
 */

import { z } from "zod";

/**
 * Encrypted payload format stored in D1
 *
 * Uses AES-256-GCM with a random 12-byte IV and 16-byte authentication tag.
 */
export const EncryptedSecretSchema = z.object({
  alg: z.literal("AES-256-GCM"),
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  tag: z.string().min(1),
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

export interface ICredentialEncryptionService {
  encrypt(
    plaintext: string,
    options: EncryptionOptions,
  ): Promise<EncryptedSecret>;
  decrypt(
    encrypted: EncryptedSecret,
    options: DecryptionOptions,
  ): Promise<string>;
  generateFingerprint(plaintext: string): string;
  isValidKeyFormat(plaintext: string): boolean;
}

/**
 * CredentialEncryptionService
 *
 * Provides AES-256-GCM encryption with support for key rotation.
 * Uses WebCrypto API for cryptographic operations.
 */
export class CredentialEncryptionService {
  private readonly ENCODING = "utf-8";
  private readonly IV_LENGTH = 12; // 96 bits for GCM
  private readonly TAG_LENGTH = 128; // 128-bit authentication tag

  /**
   * Encrypt an API key using AES-256-GCM
   *
   * @param plaintext The raw API key to encrypt
   * @param options Encryption options including master key version
   * @returns Encrypted payload ready for D1 storage
   */
  async encrypt(
    plaintext: string,
    options: EncryptionOptions,
  ): Promise<EncryptedSecret> {
    if (!plaintext || plaintext.length === 0) {
      throw new Error("Cannot encrypt empty secret");
    }

    if (!options.keyVersion) {
      throw new Error("keyVersion is required for encryption");
    }

    if (!options.masterKey || options.masterKey.length < 32) {
      throw new Error("Master key must be at least 32 characters");
    }

    try {
      // Import the master key
      const masterKey = await this.importKey(options.masterKey);

      // Generate random IV (12 bytes)
      const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));

      // Encode plaintext to bytes
      const plaintextBytes = new TextEncoder().encode(plaintext);

      // Encrypt with AES-GCM
      const ciphertextWithTag = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: iv,
          tagLength: this.TAG_LENGTH,
        },
        masterKey,
        plaintextBytes,
      );

      // Split the result into ciphertext and tag (last 16 bytes is the tag)
      const ciphertextWithTagArray = new Uint8Array(ciphertextWithTag);
      const ciphertext = ciphertextWithTagArray.slice(0, -16);
      const tag = ciphertextWithTagArray.slice(-16);

      return {
        alg: "AES-256-GCM",
        ciphertext: this.arrayBufferToBase64(ciphertext),
        iv: this.arrayBufferToBase64(iv),
        tag: this.arrayBufferToBase64(tag),
        keyVersion: options.keyVersion,
      };
    } catch (error) {
      throw new Error(
        `Encryption failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Decrypt an encrypted API key
   *
   * @param encrypted The encrypted payload from D1
   * @param options Decryption options including master key(s) for rotation
   * @returns Decrypted plaintext API key
   */
  async decrypt(
    encrypted: EncryptedSecret,
    options: DecryptionOptions,
  ): Promise<string> {
    try {
      const parsed = EncryptedSecretSchema.parse(encrypted);

      // Validate key availability
      if (!options.masterKey) {
        throw new Error("No master key available for decryption");
      }

      // Try current key first, then previous key for rotation support
      let plaintext: string | null = null;
      const keysToTry = [options.masterKey, options.previousMasterKey].filter(
        Boolean,
      ) as string[];

      for (const key of keysToTry) {
        try {
          plaintext = await this.decryptWithKey(parsed, key);
          break;
        } catch {
          // Try next key
          continue;
        }
      }

      if (plaintext === null) {
        throw new Error(
          "Decryption failed: unable to decrypt with available keys",
        );
      }

      return plaintext;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid encrypted secret format: ${error.message}`);
      }
      throw new Error(
        `Decryption failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Attempt decryption with a specific key
   */
  private async decryptWithKey(
    encrypted: EncryptedSecret,
    masterKey: string,
  ): Promise<string> {
    const key = await this.importKey(masterKey);

    const iv = this.base64ToArrayBuffer(encrypted.iv);
    const ciphertext = this.base64ToArrayBuffer(encrypted.ciphertext);
    const tag = this.base64ToArrayBuffer(encrypted.tag);

    // Combine ciphertext and tag for decryption
    const ciphertextWithTag = new Uint8Array(ciphertext.length + tag.length);
    ciphertextWithTag.set(ciphertext, 0);
    ciphertextWithTag.set(tag, ciphertext.length);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv.buffer as ArrayBuffer,
        tagLength: this.TAG_LENGTH,
      },
      key,
      ciphertextWithTag.buffer as ArrayBuffer,
    );

    return new TextDecoder(this.ENCODING).decode(decrypted);
  }

  /**
   * Import a string as an AES key
   */
  private async importKey(keyString: string): Promise<CryptoKey> {
    // Derive a key from the string using SHA-256
    const keyBytes = new TextEncoder().encode(keyString);
    const keyHash = await crypto.subtle.digest("SHA-256", keyBytes);

    return crypto.subtle.importKey(
      "raw",
      keyHash,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  /**
   * Generate fingerprint for a key (safe to display)
   *
   * Shows first 4 chars + last 4 chars of key with obfuscation.
   * E.g., "sk-...abc123def456" → "sk-...f456"
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

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: Uint8Array): string {
    const chars: string[] = [];
    for (let i = 0; i < buffer.byteLength; i++) {
      chars.push(String.fromCharCode(buffer[i]!));
    }
    return btoa(chars.join(""));
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
