/**
 * Token Encryption Utilities
 *
 * Provides secure encryption/decryption for GitHub access tokens
 * using AES-GCM with a master key.
 */

export interface EncryptedToken {
  ciphertext: string;
  iv: string;
  tag: string;
}

/**
 * Generate a cryptographically secure random token
 */
export function generateSecureToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Encrypt a token using AES-GCM
 */
export async function encryptToken(
  plaintext: string,
  masterKey: string,
): Promise<EncryptedToken> {
  // Derive a key from the master key
  const keyData = new TextEncoder().encode(masterKey);
  const key = await crypto.subtle.digest("SHA-256", keyData);

  // Import the key for AES-GCM
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  // Generate a random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the token
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoded,
  );

  // Split ciphertext and auth tag (last 16 bytes)
  const encryptedArray = new Uint8Array(encrypted);
  const ciphertext = encryptedArray.slice(0, -16).buffer;
  const tag = encryptedArray.slice(-16).buffer;

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer),
    tag: arrayBufferToBase64(tag),
  };
}

/**
 * Decrypt a token using AES-GCM
 */
export async function decryptToken(
  encrypted: EncryptedToken,
  masterKey: string,
): Promise<string> {
  // Derive the key from the master key
  const keyData = new TextEncoder().encode(masterKey);
  const key = await crypto.subtle.digest("SHA-256", keyData);

  // Import the key for AES-GCM
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  // Reconstruct the encrypted data
  const ciphertext = new Uint8Array(base64ToArrayBuffer(encrypted.ciphertext));
  const iv = new Uint8Array(base64ToArrayBuffer(encrypted.iv));
  const tag = new Uint8Array(base64ToArrayBuffer(encrypted.tag));

  // Combine ciphertext and tag
  const combined = new Uint8Array(ciphertext.byteLength + tag.byteLength);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.byteLength);

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    combined,
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
