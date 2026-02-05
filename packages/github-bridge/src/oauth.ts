/**
 * GitHub OAuth Flow Implementation
 *
 * This module handles the complete OAuth 2.0 flow for GitHub authentication,
 * including authorization URL generation, token exchange, and token refresh.
 */

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
}

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  email: string;
  name: string;
}

export const DEFAULT_SCOPES = ["repo", "read:user"];

/**
 * Generate the GitHub OAuth authorization URL
 */
export function generateAuthUrl(config: OAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: (config.scopes || DEFAULT_SCOPES).join(" "),
    state,
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  code: string,
  config: OAuthConfig,
): Promise<GitHubTokenResponse> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(
      `GitHub OAuth error: ${data.error_description || data.error}`,
    );
  }

  return data;
}

/**
 * Verify state parameter to prevent CSRF attacks
 */
export function verifyState(
  receivedState: string,
  expectedState: string,
): boolean {
  // Use timing-safe comparison to prevent timing attacks
  if (receivedState.length !== expectedState.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < receivedState.length; i++) {
    result |= receivedState.charCodeAt(i) ^ expectedState.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Generate a cryptographically secure state parameter
 */
export function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Fetch authenticated user details from GitHub
 */
export async function fetchGitHubUser(
  accessToken: string,
): Promise<GitHubUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Shadowbox-GitHub-Bridge/0.1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user: ${response.statusText}`);
  }

  return response.json();
}
