/**
 * AuthController
 *
 * Handles GitHub OAuth authentication flow
 * Part of the Control Plane (Brain) - manages identity and tokens
 */

import { CORS_HEADERS } from "../lib/cors";
import { Env } from "../types/ai";
import {
  generateAuthUrl,
  exchangeCodeForToken,
  verifyState,
  generateState,
  fetchGitHubUser,
  encryptToken,
  type OAuthConfig,
} from "@shadowbox/github-bridge";

interface AuthSession {
  state: string;
  createdAt: number;
}

const SESSION_TTL = 10 * 60 * 1000; // 10 minutes

export class AuthController {
  /**
   * Initiate GitHub OAuth flow
   * GET /auth/github/login
   */
  static async handleLogin(request: Request, env: Env): Promise<Response> {
    try {
      const state = generateState();

      // Store state in KV with expiration
      const session: AuthSession = {
        state,
        createdAt: Date.now(),
      };

      await env.SESSIONS.put(
        `oauth_state:${state}`,
        JSON.stringify(session),
        { expirationTtl: 600 }, // 10 minutes
      );

      const config: OAuthConfig = {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        redirectUri: env.GITHUB_REDIRECT_URI,
        scopes: ["repo", "read:user"],
      };

      const authUrl = generateAuthUrl(config, state);

      return new Response(null, {
        status: 302,
        headers: {
          Location: authUrl,
          ...CORS_HEADERS,
        },
      });
    } catch (error) {
      console.error("[Auth] Login error:", error);
      return errorResponse("Failed to initiate authentication", 500);
    }
  }

  /**
   * Handle GitHub OAuth callback
   * GET /auth/github/callback?code=xxx&state=xxx
   */
  static async handleCallback(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      // Handle OAuth errors from GitHub
      if (error) {
        console.error("[Auth] GitHub OAuth error:", error);
        return errorResponse(`GitHub authentication failed: ${error}`, 400);
      }

      if (!code || !state) {
        return errorResponse("Missing code or state parameter", 400);
      }

      // Verify state to prevent CSRF
      const sessionData = await env.SESSIONS.get(`oauth_state:${state}`);
      if (!sessionData) {
        return errorResponse("Invalid or expired session", 400);
      }

      const session: AuthSession = JSON.parse(sessionData);

      // Check session expiration
      if (Date.now() - session.createdAt > SESSION_TTL) {
        await env.SESSIONS.delete(`oauth_state:${state}`);
        return errorResponse("Session expired", 400);
      }

      // Verify state matches
      if (!verifyState(state, session.state)) {
        return errorResponse("Invalid state parameter", 400);
      }

      // Clean up state
      await env.SESSIONS.delete(`oauth_state:${state}`);

      // Exchange code for token
      const config: OAuthConfig = {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        redirectUri: env.GITHUB_REDIRECT_URI,
      };

      const tokenResponse = await exchangeCodeForToken(code, config);

      // Fetch user details
      const user = await fetchGitHubUser(tokenResponse.access_token);

      // Encrypt token before storing
      const encryptedToken = await encryptToken(
        tokenResponse.access_token,
        env.GITHUB_TOKEN_ENCRYPTION_KEY,
      );

      // Create or update user session
      const userSession = {
        userId: user.id.toString(),
        login: user.login,
        avatar: user.avatar_url,
        email: user.email,
        encryptedToken,
        createdAt: Date.now(),
      };

      // Store session (7 days expiration)
      await env.SESSIONS.put(
        `user_session:${user.id}`,
        JSON.stringify(userSession),
        { expirationTtl: 7 * 24 * 60 * 60 },
      );

      // Create session cookie/token for frontend
      const sessionToken = await generateSessionToken(user.id.toString(), env);

      // Redirect to frontend with session token
      const redirectUrl = new URL(env.FRONTEND_URL);
      redirectUrl.searchParams.set("session", sessionToken);
      redirectUrl.searchParams.set("user", user.login);

      return new Response(null, {
        status: 302,
        headers: {
          Location: redirectUrl.toString(),
          ...CORS_HEADERS,
          "Set-Cookie": createSessionCookie(sessionToken),
        },
      });
    } catch (error) {
      console.error("[Auth] Callback error:", error);
      const message =
        error instanceof Error ? error.message : "Authentication failed";
      return errorResponse(message, 500);
    }
  }

  /**
   * Get current user session
   * GET /auth/session
   */
  static async handleGetSession(request: Request, env: Env): Promise<Response> {
    try {
      const sessionToken = extractSessionToken(request);
      if (!sessionToken) {
        return jsonResponse({ authenticated: false });
      }

      const userId = await verifySessionToken(sessionToken, env);
      if (!userId) {
        return jsonResponse({ authenticated: false });
      }

      const sessionData = await env.SESSIONS.get(`user_session:${userId}`);
      if (!sessionData) {
        return jsonResponse({ authenticated: false });
      }

      const session = JSON.parse(sessionData);

      return jsonResponse({
        authenticated: true,
        user: {
          id: session.userId,
          login: session.login,
          avatar: session.avatar,
          email: session.email,
        },
      });
    } catch (error) {
      console.error("[Auth] Session error:", error);
      return errorResponse("Failed to get session", 500);
    }
  }

  /**
   * Logout user
   * POST /auth/logout
   */
  static async handleLogout(request: Request, env: Env): Promise<Response> {
    try {
      const sessionToken = extractSessionToken(request);
      if (sessionToken) {
        const userId = await verifySessionToken(sessionToken, env);
        if (userId) {
          await env.SESSIONS.delete(`user_session:${userId}`);
        }
      }

      return jsonResponse(
        { success: true },
        {
          "Set-Cookie":
            "shadowbox_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict",
        },
      );
    } catch (error) {
      console.error("[Auth] Logout error:", error);
      return errorResponse("Logout failed", 500);
    }
  }
}

/**
 * Generate a signed session token
 */
async function generateSessionToken(userId: string, env: Env): Promise<string> {
  const data = `${userId}:${Date.now()}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

  return `${data}:${sigBase64}`;
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
 * Extract session token from request
 */
function extractSessionToken(request: Request): string | null {
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
 * Create session cookie
 */
function createSessionCookie(token: string): string {
  return `shadowbox_session=${token}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Strict`;
}

/**
 * JSON response helper
 */
function jsonResponse(
  data: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...headers,
    },
  });
}

/**
 * Error response helper
 */
function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}
