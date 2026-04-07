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
import type { GitCommitIdentityState } from "@repo/shared-types";

export interface UserSessionRecord {
  userId: string;
  login: string;
  avatar: string;
  email: string | null;
  name?: string | null;
  encryptedToken: EncryptedToken;
  createdAt: number;
  commitIdentity?: GitCommitIdentityState;
}

export interface AuthResult {
  client: GitHubAPIClient;
  userId: string;
  session: UserSessionRecord;
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
    if (match && match[1]) return match[1];
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
  const authenticatedSession = await getAuthenticatedUserSession(request, env);
  if (!authenticatedSession) {
    return null;
  }

  const { userId, session } = authenticatedSession;

  // Decrypt token
  const accessToken = await decryptToken(
    session.encryptedToken,
    env.GITHUB_TOKEN_ENCRYPTION_KEY,
  );

  return {
    client: new GitHubAPIClient(accessToken),
    userId,
    session,
  };
}

export async function getAuthenticatedUserSession(
  request: Request,
  env: Env,
): Promise<{ userId: string; session: UserSessionRecord } | null> {
  const sessionToken = extractSessionToken(request);
  if (!sessionToken) {
    console.warn("[auth/session] missing session token on request");
    return null;
  }

  const userId = await verifySessionToken(sessionToken, env);
  if (!userId) {
    console.warn("[auth/session] session token failed verification");
    return null;
  }

  // Get user session from KV storage
  const sessionData = await env.SESSIONS.get(`user_session:${userId}`);
  if (!sessionData) {
    console.warn("[auth/session] verified token but no session record found", {
      userId,
    });
    return null;
  }

  const session = parseUserSessionRecord(sessionData);
  if (!session) {
    console.warn("[auth/session] session record payload is invalid", {
      userId,
    });
    return null;
  }

  return {
    userId,
    session,
  };
}

function parseUserSessionRecord(payload: string): UserSessionRecord | null {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!isUserSessionRecord(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isUserSessionRecord(value: unknown): value is UserSessionRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.userId === "string" &&
    typeof record.login === "string" &&
    typeof record.avatar === "string" &&
    isEncryptedTokenRecord(record.encryptedToken) &&
    typeof record.createdAt === "number" &&
    (record.email === null || typeof record.email === "string") &&
    (record.name === undefined ||
      record.name === null ||
      typeof record.name === "string")
  );
}

function isEncryptedTokenRecord(value: unknown): value is EncryptedToken {
  if (!value || typeof value !== "object") {
    return false;
  }

  const token = value as Record<string, unknown>;
  return (
    typeof token.ciphertext === "string" &&
    typeof token.iv === "string" &&
    typeof token.tag === "string"
  );
}
