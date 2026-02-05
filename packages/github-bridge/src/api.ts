/**
 * GitHub API Client
 *
 * Provides a type-safe wrapper around the GitHub REST API
 * for repository operations, file access, and PR management.
 */

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

export interface FileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir";
  content?: string;
  encoding?: string;
  html_url: string;
  download_url: string | null;
}

export interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  user: {
    login: string;
    avatar_url: string;
  };
  created_at: string;
  updated_at: string;
}

export interface CreatePullRequestParams {
  title: string;
  body?: string;
  head: string;
  base: string;
}

export class GitHubAPIClient {
  private accessToken: string;
  private baseUrl = "https://api.github.com";

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Shadowbox-GitHub-Bridge/0.1.0",
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${error}`);
    }

    return response.json();
  }

  /**
   * List repositories for the authenticated user
   */
  async listRepositories(
    type: "all" | "owner" | "member" = "all",
    sort: "created" | "updated" | "pushed" | "full_name" = "updated",
    perPage: number = 30,
  ): Promise<Repository[]> {
    return this.request(
      `/user/repos?type=${type}&sort=${sort}&per_page=${perPage}`,
    );
  }

  /**
   * List branches for a repository
   */
  async listBranches(owner: string, repo: string): Promise<Branch[]> {
    return this.request(`/repos/${owner}/${repo}/branches`);
  }

  /**
   * Get repository contents
   */
  async getContents(
    owner: string,
    repo: string,
    path: string = "",
    ref?: string,
  ): Promise<FileContent | FileContent[]> {
    const query = ref ? `?ref=${ref}` : "";
    return this.request(`/repos/${owner}/${repo}/contents/${path}${query}`);
  }

  /**
   * Get a single file's content
   */
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<string> {
    const query = ref ? `?ref=${ref}` : "";
    const response = await this.request<FileContent>(
      `/repos/${owner}/${repo}/contents/${path}${query}`,
    );

    if (response.encoding === "base64" && response.content) {
      // Decode base64 content
      const binaryString = atob(response.content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    }

    return response.content || "";
  }

  /**
   * Get repository tree recursively
   */
  async getTree(
    owner: string,
    repo: string,
    sha: string = "HEAD",
  ): Promise<
    Array<{ path: string; type: string; sha: string; size?: number }>
  > {
    const response = await this.request<{
      tree: Array<{ path: string; type: string; sha: string; size?: number }>;
    }>(`/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`);

    return response.tree;
  }

  /**
   * Create a new branch
   */
  async createBranch(
    owner: string,
    repo: string,
    branch: string,
    baseSha: string,
  ): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: baseSha,
      }),
    });
  }

  /**
   * Get the SHA of a branch
   */
  async getBranchSha(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<string> {
    const response = await this.request<{ object: { sha: string } }>(
      `/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    );
    return response.object.sha;
  }

  /**
   * Create a pull request
   */
  async createPullRequest(
    owner: string,
    repo: string,
    params: CreatePullRequestParams,
  ): Promise<PullRequest> {
    return this.request(`/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  /**
   * List pull requests for a repository
   */
  async listPullRequests(
    owner: string,
    repo: string,
    state: "open" | "closed" | "all" = "open",
  ): Promise<PullRequest[]> {
    return this.request(`/repos/${owner}/${repo}/pulls?state=${state}`);
  }

  /**
   * Get a single pull request
   */
  async getPullRequest(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PullRequest> {
    return this.request(`/repos/${owner}/${repo}/pulls/${number}`);
  }
}
