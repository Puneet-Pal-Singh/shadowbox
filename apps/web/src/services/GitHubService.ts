/**
 * GitHub Service for Web Frontend
 *
 * Handles authentication state, repository listing, and GitHub API calls
 */

export interface GitHubUser {
  id: string;
  login: string;
  avatar: string;
  email: string;
}

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  description: string | null;
  private: boolean;
  html_url: string;
  clone_url: string;
  default_branch: string;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
}

export interface Branch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

const BRAIN_API_URL =
  import.meta.env.VITE_BRAIN_BASE_URL || "http://localhost:8788";

/**
 * Helper to get fetch options with optional session token
 */
function getFetchOptions(options: RequestInit = {}): RequestInit {
  const token = localStorage.getItem("shadowbox_session");
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return {
    ...options,
    headers,
    credentials: "include",
  };
}

/**
 * Get current session from Brain API
 */
export async function getSession(): Promise<{
  authenticated: boolean;
  user?: GitHubUser;
}> {
  const response = await fetch(
    `${BRAIN_API_URL}/auth/session`,
    getFetchOptions(),
  );

  if (!response.ok) {
    return { authenticated: false };
  }

  const data = await response.json();

  // If we got a user, but didn't have a token in localStorage,
  // we might want to keep it that way (let cookie handle it).
  // But if we're authenticated, we're good.
  return data;
}

/**
 * Initiate GitHub OAuth flow
 */
export function initiateGitHubLogin(): void {
  window.location.href = `${BRAIN_API_URL}/auth/github/login`;
}

/**
 * Logout user
 */
export async function logout(): Promise<void> {
  localStorage.removeItem("shadowbox_session");
  await fetch(
    `${BRAIN_API_URL}/auth/logout`,
    getFetchOptions({
      method: "POST",
    }),
  );
}

/**
 * List user's repositories
 */
export async function listRepositories(
  type: "all" | "owner" | "member" = "all",
  sort: "created" | "updated" | "pushed" | "full_name" = "updated",
): Promise<Repository[]> {
  const response = await fetch(
    `${BRAIN_API_URL}/api/github/repos?type=${type}&sort=${sort}`,
    getFetchOptions(),
  );

  if (!response.ok) {
    throw new Error("Failed to fetch repositories");
  }

  const data = await response.json();
  return data.repositories;
}

/**
 * List branches for a repository
 */
export async function listBranches(
  owner: string,
  repo: string,
): Promise<Branch[]> {
  const response = await fetch(
    `${BRAIN_API_URL}/api/github/branches?owner=${owner}&repo=${repo}`,
    getFetchOptions(),
  );

  if (!response.ok) {
    throw new Error("Failed to fetch branches");
  }

  const data = await response.json();
  return data.branches;
}

/**
 * Get repository tree structure
 */
export async function getRepositoryTree(
  owner: string,
  repo: string,
  sha: string = "HEAD",
): Promise<Array<{ path: string; type: string; sha: string }>> {
  const response = await fetch(
    `${BRAIN_API_URL}/api/github/tree?owner=${owner}&repo=${repo}&sha=${sha}`,
    getFetchOptions(),
  );

  if (!response.ok) {
    throw new Error("Failed to fetch tree");
  }

  const data = await response.json();
  return data.tree;
}

/**
 * Get file content from a repository
 */
export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  ref: string = "HEAD",
): Promise<{ content: string; sha: string; size: number; encoding: string }> {
  const response = await fetch(
    `${BRAIN_API_URL}/api/github/contents?owner=${owner}&repo=${repo}&path=${encodeURIComponent(path)}&ref=${ref}`,
    getFetchOptions(),
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch file content: ${response.statusText}`);
  }

  const data = await response.json();
  return data.contents;
}

/**
 * Handle OAuth callback
 * Extracts session token from URL and stores it
 */
export function handleOAuthCallback(): {
  user: string | null;
  success: boolean;
} {
  const params = new URLSearchParams(window.location.search);
  const session = params.get("session");
  const user = params.get("user");

  if (session) {
    // Store token in localStorage as fallback for cookies
    localStorage.setItem("shadowbox_session", session);

    // Just clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
    return { user, success: true };
  }

  return { user: null, success: false };
}
