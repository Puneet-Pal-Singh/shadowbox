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
  import.meta.env.VITE_BRAIN_API_URL || "http://localhost:8788";

/**
 * Get current session from Brain API
 */
export async function getSession(): Promise<{
  authenticated: boolean;
  user?: GitHubUser;
}> {
  const response = await fetch(`${BRAIN_API_URL}/auth/session`, {
    credentials: "include",
  });

  if (!response.ok) {
    return { authenticated: false };
  }

  return response.json();
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
  await fetch(`${BRAIN_API_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
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
    {
      credentials: "include",
    },
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
    {
      credentials: "include",
    },
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
    {
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch tree");
  }

  const data = await response.json();
  return data.tree;
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
    // Token is already stored in cookie by the backend
    // Just clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
    return { user, success: true };
  }

  return { user: null, success: false };
}
