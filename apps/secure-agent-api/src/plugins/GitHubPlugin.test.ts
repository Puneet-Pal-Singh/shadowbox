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
});
