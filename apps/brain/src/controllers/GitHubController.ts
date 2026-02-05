/**
 * GitHubController
 *
 * Handles GitHub API operations for repository management
 * Part of the Control Plane (Brain)
 */

import { CORS_HEADERS } from "../lib/cors";
import { Env } from "../types/ai";
import {
  GitHubAPIClient,
  decryptToken,
  type EncryptedToken,
} from "@shadowbox/github-bridge";

/**
 * Extract session token from request
 */
function extractSessionToken(request: Request): string | null {
  const cookie = request.headers.get("Cookie");
  if (cookie) {
    const match = cookie.match(/shadowbox_session=([^;]+)/);
    if (match) return match[1];
  }

  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7);
  }

  return null;
}

/**
 * Verify and extract user ID from session token
 */
async function verifySessionToken(
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
 * Get authenticated client for user
 */
async function getGitHubClient(
  request: Request,
  env: Env,
): Promise<{ client: GitHubAPIClient; userId: string } | null> {
  const sessionToken = extractSessionToken(request);
  if (!sessionToken) return null;

  const userId = await verifySessionToken(sessionToken, env);
  if (!userId) return null;

  // Get user session
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

/**
 * JSON response helper
 */
function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Error response helper
 */
function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

export class GitHubController {
  /**
   * List user's repositories
   * GET /api/github/repos
   */
  static async listRepositories(request: Request, env: Env): Promise<Response> {
    try {
      const auth = await getGitHubClient(request, env);
      if (!auth) {
        return errorResponse("Unauthorized", 401);
      }

      const { client } = auth;

      const url = new URL(request.url);
      const type =
        (url.searchParams.get("type") as "all" | "owner" | "member") || "all";
      const sort =
        (url.searchParams.get("sort") as
          | "created"
          | "updated"
          | "pushed"
          | "full_name") || "updated";
      const perPage = parseInt(url.searchParams.get("per_page") || "30", 10);

      const repos = await client.listRepositories(type, sort, perPage);

      return jsonResponse({ repositories: repos });
    } catch (error) {
      console.error("[GitHub] List repos error:", error);
      const message =
        error instanceof Error ? error.message : "Failed to list repositories";
      return errorResponse(message, 500);
    }
  }

  /**
   * List branches for a repository
   * GET /api/github/branches?owner=xxx&repo=xxx
   */
  static async listBranches(request: Request, env: Env): Promise<Response> {
    try {
      const auth = await getGitHubClient(request, env);
      if (!auth) {
        return errorResponse("Unauthorized", 401);
      }

      const { client } = auth;

      const url = new URL(request.url);
      const owner = url.searchParams.get("owner");
      const repo = url.searchParams.get("repo");

      if (!owner || !repo) {
        return errorResponse("Missing owner or repo parameter", 400);
      }

      const branches = await client.listBranches(owner, repo);

      return jsonResponse({ branches });
    } catch (error) {
      console.error("[GitHub] List branches error:", error);
      const message =
        error instanceof Error ? error.message : "Failed to list branches";
      return errorResponse(message, 500);
    }
  }

  /**
   * Get repository contents
   * GET /api/github/contents?owner=xxx&repo=xxx&path=xxx&ref=xxx
   */
  static async getContents(request: Request, env: Env): Promise<Response> {
    try {
      const auth = await getGitHubClient(request, env);
      if (!auth) {
        return errorResponse("Unauthorized", 401);
      }

      const { client } = auth;

      const url = new URL(request.url);
      const owner = url.searchParams.get("owner");
      const repo = url.searchParams.get("repo");
      const path = url.searchParams.get("path") || "";
      const ref = url.searchParams.get("ref") || undefined;

      if (!owner || !repo) {
        return errorResponse("Missing owner or repo parameter", 400);
      }

      const contents = await client.getContents(owner, repo, path, ref);

      return jsonResponse({ contents });
    } catch (error) {
      console.error("[GitHub] Get contents error:", error);
      const message =
        error instanceof Error ? error.message : "Failed to get contents";
      return errorResponse(message, 500);
    }
  }

  /**
   * Get repository file tree
   * GET /api/github/tree?owner=xxx&repo=xxx&sha=xxx
   */
  static async getTree(request: Request, env: Env): Promise<Response> {
    try {
      const auth = await getGitHubClient(request, env);
      if (!auth) {
        return errorResponse("Unauthorized", 401);
      }

      const { client } = auth;

      const url = new URL(request.url);
      const owner = url.searchParams.get("owner");
      const repo = url.searchParams.get("repo");
      const sha = url.searchParams.get("sha") || "HEAD";

      if (!owner || !repo) {
        return errorResponse("Missing owner or repo parameter", 400);
      }

      const tree = await client.getTree(owner, repo, sha);

      return jsonResponse({ tree });
    } catch (error) {
      console.error("[GitHub] Get tree error:", error);
      const message =
        error instanceof Error ? error.message : "Failed to get tree";
      return errorResponse(message, 500);
    }
  }
}
