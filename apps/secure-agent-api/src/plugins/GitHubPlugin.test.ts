import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sandbox } from "@cloudflare/sandbox";
import { GitHubPlugin } from "./GitHubPlugin";

function asSandbox(): Sandbox {
  return {} as Sandbox;
}

describe("GitHubPlugin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a GitHub token for connector metadata actions", async () => {
    const plugin = new GitHubPlugin();
    const result = await plugin.execute(asSandbox(), {
      action: "pr_get",
      owner: "acme",
      repo: "career-crew",
      number: 228,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("GitHub token is required");
  });

  it("normalizes pull request metadata from GitHub REST responses", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          number: 228,
          title: "Fix CI failures",
          state: "open",
          draft: false,
          mergeable: true,
          html_url: "https://github.com/acme/career-crew/pull/228",
          head: { ref: "fix/ci", sha: "abc123" },
          base: { ref: "main" },
          user: { login: "puneet" },
          created_at: "2026-04-19T09:00:00Z",
          updated_at: "2026-04-19T10:00:00Z",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const plugin = new GitHubPlugin();
    const result = await plugin.execute(asSandbox(), {
      action: "pr_get",
      owner: "acme",
      repo: "career-crew",
      number: 228,
      token: "ghp_test",
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/career-crew/pulls/228",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer ghp_test",
        }),
      }),
    );
    expect(JSON.parse(String(result.output))).toMatchObject({
      number: 228,
      title: "Fix CI failures",
      headRef: "fix/ci",
      baseRef: "main",
      author: "puneet",
    });
  });

  it("lists pull requests by head branch through the GitHub connector", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            number: 229,
            title: "Fix review comments",
            state: "open",
            draft: false,
            html_url: "https://github.com/acme/career-crew/pull/229",
            head: { ref: "chore/axis-model-routing-cleanup", sha: "def456" },
            base: { ref: "main" },
            user: { login: "puneet" },
            created_at: "2026-04-20T10:00:00Z",
            updated_at: "2026-04-20T11:00:00Z",
          },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const plugin = new GitHubPlugin();
    const result = await plugin.execute(asSandbox(), {
      action: "pr_list",
      owner: "acme",
      repo: "career-crew",
      state: "open",
      head: "chore/axis-model-routing-cleanup",
      token: "ghp_test",
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/career-crew/pulls?state=open&per_page=100&head=acme%3Achore%2Faxis-model-routing-cleanup",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer ghp_test",
        }),
      }),
    );
    expect(JSON.parse(String(result.output))).toMatchObject({
      state: "open",
      head: "chore/axis-model-routing-cleanup",
      count: 1,
      pullRequests: [
        expect.objectContaining({
          number: 229,
          title: "Fix review comments",
          headRef: "chore/axis-model-routing-cleanup",
        }),
      ],
    });
  });

  it("rejects unsupported repository path segments before making API calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const plugin = new GitHubPlugin();
    const result = await plugin.execute(asSandbox(), {
      action: "issue_get",
      owner: "acme/org",
      repo: "career-crew",
      number: 5,
      token: "ghp_test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("owner contains unsupported characters");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("paginates review comments and reports non-truncated results", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      body: `Comment ${index + 1}`,
      user: { login: "reviewer" },
      created_at: "2026-04-19T10:00:00Z",
    }));
    const secondPage = [
      {
        id: 201,
        body: "Final comment",
        user: { login: "reviewer-2" },
        created_at: "2026-04-19T10:05:00Z",
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(firstPage), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(secondPage), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const plugin = new GitHubPlugin();
    const result = await plugin.execute(asSandbox(), {
      action: "review_threads_get",
      owner: "acme",
      repo: "career-crew",
      number: 229,
      token: "ghp_test",
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const output = JSON.parse(String(result.output)) as {
      pullRequestNumber: number;
      truncated: boolean;
      threadCount: number;
    };
    expect(output.pullRequestNumber).toBe(229);
    expect(output.truncated).toBe(false);
    expect(output.threadCount).toBe(101);
  });

  it("fails fast when GitHub request exceeds timeout", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const fetchMock = vi.fn().mockRejectedValueOnce(abortError);
    vi.stubGlobal("fetch", fetchMock);

    const plugin = new GitHubPlugin();
    const result = await plugin.execute(asSandbox(), {
      action: "pr_get",
      owner: "acme",
      repo: "career-crew",
      number: 229,
      token: "ghp_test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("timed out");
  });
});
