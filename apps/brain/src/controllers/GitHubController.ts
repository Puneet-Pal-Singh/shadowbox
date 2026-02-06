/**
 * GitHubController
 *
 * Handles GitHub API operations for repository management
 * Part of the Control Plane (Brain)
 * Follows Single Responsibility: Only handles GitHub API routes
 */

import { CORS_HEADERS } from "../lib/cors";
import { Env } from "../types/ai";
import { getGitHubClient } from "../services/AuthService";
import type { CreatePullRequestParams } from "@shadowbox/github-bridge";

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

  /**
   * List pull requests for a repository
   * GET /api/github/pulls?owner=xxx&repo=xxx&state=xxx
   */
  static async listPullRequests(request: Request, env: Env): Promise<Response> {
    try {
      const auth = await getGitHubClient(request, env);
      if (!auth) {
        return errorResponse("Unauthorized", 401);
      }

      const { client } = auth;

      const url = new URL(request.url);
      const owner = url.searchParams.get("owner");
      const repo = url.searchParams.get("repo");
      const state =
        (url.searchParams.get("state") as "open" | "closed" | "all") || "open";

      if (!owner || !repo) {
        return errorResponse("Missing owner or repo parameter", 400);
      }

      const pullRequests = await client.listPullRequests(owner, repo, state);

      return jsonResponse({ pullRequests });
    } catch (error) {
      console.error("[GitHub] List PRs error:", error);
      const message =
        error instanceof Error ? error.message : "Failed to list pull requests";
      return errorResponse(message, 500);
    }
  }

  /**
   * Get a single pull request
   * GET /api/github/pulls/:number?owner=xxx&repo=xxx
   */
  static async getPullRequest(request: Request, env: Env): Promise<Response> {
    try {
      const auth = await getGitHubClient(request, env);
      if (!auth) {
        return errorResponse("Unauthorized", 401);
      }

      const { client } = auth;

      const url = new URL(request.url);
      const owner = url.searchParams.get("owner");
      const repo = url.searchParams.get("repo");
      const pathParts = url.pathname.split("/");
      const numberStr = pathParts[pathParts.length - 1];
      const number = numberStr ? parseInt(numberStr, 10) : NaN;

      if (!owner || !repo || isNaN(number)) {
        return errorResponse("Missing or invalid parameters", 400);
      }

      const pullRequest = await client.getPullRequest(owner, repo, number);

      return jsonResponse({ pullRequest });
    } catch (error) {
      console.error("[GitHub] Get PR error:", error);
      const message =
        error instanceof Error ? error.message : "Failed to get pull request";
      return errorResponse(message, 500);
    }
  }

  /**
   * Create a pull request
   * POST /api/github/pulls
   */
  static async createPullRequest(
    request: Request,
    env: Env,
  ): Promise<Response> {
    try {
      const auth = await getGitHubClient(request, env);
      if (!auth) {
        return errorResponse("Unauthorized", 401);
      }

      const { client } = auth;

      const body = (await request.json()) as {
        owner?: string;
        repo?: string;
        title?: string;
        head?: string;
        base?: string;
        body?: string;
      };

      const owner = body.owner;
      const repo = body.repo;
      const title = body.title;
      const head = body.head;
      const base = body.base;

      if (!owner || !repo || !title || !head || !base) {
        return errorResponse("Missing required parameters", 400);
      }

      const params: CreatePullRequestParams = {
        title,
        head,
        base,
        body: body.body,
      };

      const pullRequest = await client.createPullRequest(owner, repo, params);

      return jsonResponse({ pullRequest }, 201);
    } catch (error) {
      console.error("[GitHub] Create PR error:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create pull request";
      return errorResponse(message, 500);
    }
  }
}
