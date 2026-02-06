/**
 * AuthController
 *
 * Handles GitHub OAuth authentication flow
 * Part of the Control Plane (Brain) - manages identity and tokens
 * Follows Single Responsibility: Only handles OAuth flow
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
import {
  extractSessionToken,
  verifySessionToken,
} from "../services/AuthService";

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
  static async handleLogin(_request: Request, env: Env): Promise<Response> {
    try {
      console.log("[Auth] Initiating OAuth login...");

      // Validate required environment variables
      if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
        console.error(
          "[Auth] Missing required GitHub OAuth environment variables",
        );
        console.error(
          "[Auth] GITHUB_CLIENT_ID:",
          env.GITHUB_CLIENT_ID ? "set" : "NOT SET",
        );
        console.error(
          "[Auth] GITHUB_CLIENT_SECRET:",
          env.GITHUB_CLIENT_SECRET ? "set" : "NOT SET",
        );
        return errorResponse(
          "Server configuration error: Missing GitHub OAuth credentials. " +
            "Please check your .dev.vars file and ensure GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are set.",
          500,
        );
      }

      if (!env.GITHUB_REDIRECT_URI) {
        console.error("[Auth] Missing GITHUB_REDIRECT_URI");
        return errorResponse(
          "Server configuration error: Missing redirect URI",
          500,
        );
      }

      const state = generateState();
      console.log("[Auth] Generated OAuth state");

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
      console.log("[Auth] OAuth state stored in KV");

      const config: OAuthConfig = {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        redirectUri: env.GITHUB_REDIRECT_URI,
        scopes: ["repo", "read:user"],
      };

      const authUrl = generateAuthUrl(config, state);
      console.log(
        "[Auth] Redirecting to GitHub:",
        authUrl.substring(0, 60) + "...",
      );

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
      console.log("[Auth] OAuth callback received");

      const url = new URL(request.url);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      console.log("[Auth] Callback params:", {
        code: !!code,
        state: !!state,
        error,
      });

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
        console.error("[Auth] State not found in KV store");
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

      // Check required environment variables
      if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
        console.error("[Auth] Missing GitHub OAuth credentials");
        return errorResponse(
          "Server configuration error: Missing GitHub credentials",
          500,
        );
      }

      // Exchange code for token
      const config: OAuthConfig = {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        redirectUri: env.GITHUB_REDIRECT_URI,
      };

      console.log("[Auth] Exchanging code for token...");
      const tokenResponse = await exchangeCodeForToken(code, config);
      console.log("[Auth] Token received successfully");

      // Fetch user details
      console.log("[Auth] Fetching user details...");
      const user = await fetchGitHubUser(tokenResponse.access_token);
      console.log("[Auth] User fetched:", user.login);

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
      const frontendUrl = env.FRONTEND_URL || "http://localhost:5173";
      console.log("[Auth] Redirecting to frontend:", frontendUrl);

      const redirectUrl = new URL(frontendUrl);
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
