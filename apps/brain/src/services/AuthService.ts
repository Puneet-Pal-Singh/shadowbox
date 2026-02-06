/**
 * AuthService
 *
 * Shared authentication utilities for extracting and verifying session tokens.
 * Follows Single Responsibility: Only handles auth-related operations.
 * Used by multiple controllers (AuthController, GitHubController).
 */

import { Env } from "../types/ai";
import {
  GitHubAPIClient,
  decryptToken,
  type EncryptedToken,
} from "@shadowbox/github-bridge";

export interface AuthResult {
  client: GitHubAPIClient;
  userId: string;
}

/**
 * Extract session token from request
 * Checks both cookies and Authorization header
 */
export function extractSessionToken(request: Request): string | null {
  // Check cookie first
  const cookie = request.headers.get("Cookie");
  if (cookie) {
    const match = cookie.match(/shadowbox_session=([^;]+)/);
    if (match) return match[1];
  }

  // Check Authorization header
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7);
  }

  return null;
}

/**
 * Verify and extract user ID from session token
 * Uses HMAC-SHA256 for token validation
 */
export async function verifySessionToken(
  token: string,
  env: Env,
): Promise<string | null> {
  try {
    const [userId, timestamp, signature] = token.split(":");
    if (!userId || !timestamp || !signature) return null;

    const data = `${userId}:${timestamp}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const sigBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      encoder.encode(data),
    );

    if (!valid) return null;

    // Check expiration (7 days)
    const tokenTime = parseInt(timestamp, 10);
    if (Date.now() - tokenTime > 7 * 24 * 60 * 60 * 1000) {
      return null;
    }

    return userId;
  } catch {
    return null;
  }
}

/**
 * Get authenticated GitHub client for user
 * Returns null if authentication fails
 */
export async function getGitHubClient(
  request: Request,
  env: Env,
): Promise<AuthResult | null> {
  const sessionToken = extractSessionToken(request);
  if (!sessionToken) return null;

  const userId = await verifySessionToken(sessionToken, env);
  if (!userId) return null;

  // Get user session from KV storage
  const sessionData = await env.SESSIONS.get(`user_session:${userId}`);
  if (!sessionData) return null;

  const session = JSON.parse(sessionData);
  const encryptedToken: EncryptedToken = session.encryptedToken;

  // Decrypt token
  const accessToken = await decryptToken(
    encryptedToken,
    env.GITHUB_TOKEN_ENCRYPTION_KEY,
  );

  return {
    client: new GitHubAPIClient(accessToken),
    userId,
  };
}
