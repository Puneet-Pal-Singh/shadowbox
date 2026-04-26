import { describe, expect, it, vi } from "vitest";
import { WorkspaceBootstrapService } from "./WorkspaceBootstrapService";

const CLEAN_GIT_STATUS_OUTPUT = JSON.stringify({
  branch: "main",
  files: [],
  ahead: 0,
  behind: 0,
  repoIdentity: "github.com/sourcegraph/shadowbox",
  hasStaged: false,
  hasUnstaged: false,
  gitAvailable: true,
});

describe("WorkspaceBootstrapService", () => {
  it("returns invalid-context when owner/repo are missing", async () => {
    const execute = vi.fn(async () => ({ success: true }));
    const service = new WorkspaceBootstrapService({ execute }, 0);

    const result = await service.bootstrap({
      runId: "run-1",
      mode: "git_write",
      repositoryContext: { owner: "", repo: "" },
    });

    expect(result.status).toBe("invalid-context");
    expect(execute).not.toHaveBeenCalled();
  });

  it("clones workspace when git repository is not initialized", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        error: "fatal: not a git repository",
      })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true });
    const service = new WorkspaceBootstrapService({ execute }, 0);

    const result = await service.bootstrap({
      runId: "run-1",
      mode: "git_write",
      repositoryContext: {
        owner: "sourcegraph",
        repo: "shadowbox",
        branch: "dev",
      },
    });

    expect(result.status).toBe("ready");
    expect(execute).toHaveBeenNthCalledWith(1, "git", "git_status", {});
    expect(execute).toHaveBeenNthCalledWith(2, "git", "git_clone", {
      url: "https://github.com/sourcegraph/shadowbox.git",
    });
  });

  it("retries transient git status failures before continuing bootstrap", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        error: "SandboxError: HTTP error! status: 500",
      })
      .mockResolvedValueOnce({
        success: true,
        output: CLEAN_GIT_STATUS_OUTPUT,
      })
      .mockResolvedValueOnce({ success: true }) // fetch
      .mockResolvedValueOnce({ success: true }) // switch
      .mockResolvedValueOnce({ success: true }); // pull
    const service = new WorkspaceBootstrapService({ execute }, 0);

    const result = await service.bootstrap({
      runId: "run-retry-status",
      mode: "git_write",
      repositoryContext: {
        owner: "sourcegraph",
        repo: "shadowbox",
        branch: "main",
      },
    });

    expect(result.status).toBe("ready");
    expect(execute).toHaveBeenCalledTimes(5);
    expect(execute).toHaveBeenNthCalledWith(1, "git", "git_status", {});
    expect(execute).toHaveBeenNthCalledWith(2, "git", "git_status", {});
    expect(execute).toHaveBeenNthCalledWith(3, "git", "git_fetch", {
      remote: "origin",
    });
  });

  it("retries local-dev-session proxy misses before continuing bootstrap", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        error:
          "Couldn't find a local dev session for the \"default\" entrypoint of service \"shadowbox-api\" to proxy to",
      })
      .mockResolvedValueOnce({
        success: true,
        output: CLEAN_GIT_STATUS_OUTPUT,
      })
      .mockResolvedValueOnce({ success: true }) // fetch
      .mockResolvedValueOnce({ success: true }) // switch
      .mockResolvedValueOnce({ success: true }); // pull
    const service = new WorkspaceBootstrapService({ execute }, 0);

    const result = await service.bootstrap({
      runId: "run-retry-local-dev-session",
      mode: "git_write",
      repositoryContext: {
        owner: "sourcegraph",
        repo: "shadowbox",
        branch: "main",
      },
    });

    expect(result.status).toBe("ready");
    expect(execute).toHaveBeenCalledTimes(5);
    expect(execute).toHaveBeenNthCalledWith(1, "git", "git_status", {});
    expect(execute).toHaveBeenNthCalledWith(2, "git", "git_status", {});
  });

  it("returns friendly sync-failed guidance when transient status misses persist", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        error:
          "Couldn't find a local dev session for the \"default\" entrypoint of service \"shadowbox-api\" to proxy to",
      })
      .mockResolvedValueOnce({
        success: false,
        error:
          "Couldn't find a local dev session for the \"default\" entrypoint of service \"shadowbox-api\" to proxy to",
      })
      .mockResolvedValueOnce({
        success: false,
        error:
          "Couldn't find a local dev session for the \"default\" entrypoint of service \"shadowbox-api\" to proxy to",
      });
    const service = new WorkspaceBootstrapService({ execute }, 0);

    const result = await service.bootstrap({
      runId: "run-sync-failed-local-dev-session",
      mode: "git_write",
      repositoryContext: {
        owner: "sourcegraph",
        repo: "shadowbox",
        branch: "main",
      },
    });

    expect(result.status).toBe("sync-failed");
    expect(result.message).toBe(
      "Git service is temporarily unavailable. Please retry in a few seconds.",
    );
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("returns needs-auth on git authentication failures", async () => {
    const execute = vi.fn(async () => ({
      success: false,
      error: "remote: Permission to private/repo denied to user",
    }));
    const service = new WorkspaceBootstrapService({ execute }, 0);

    const result = await service.bootstrap({
      runId: "run-1",
      mode: "git_write",
      repositoryContext: {
        owner: "private",
        repo: "repo",
      },
    });

    expect(result.status).toBe("needs-auth");
  });

  it("retries clone with replaceExisting when workspace directory is non-empty", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        error: "fatal: not a git repository",
      })
      .mockResolvedValueOnce({
        success: false,
        error:
          "fatal: destination path '/home/sandbox/runs/run-1' already exists and is not an empty directory.",
      })
      .mockResolvedValueOnce({ success: true }) // forced clone
      .mockResolvedValueOnce({ success: true }) // fetch
      .mockResolvedValueOnce({ success: true }) // switch
      .mockResolvedValueOnce({ success: true }); // pull
    const service = new WorkspaceBootstrapService({ execute }, 0);

    const result = await service.bootstrap({
      runId: "run-1",
      mode: "git_write",
      repositoryContext: {
        owner: "sourcegraph",
        repo: "shadowbox",
        branch: "dev",
      },
    });

    expect(result.status).toBe("ready");
    expect(execute).toHaveBeenNthCalledWith(2, "git", "git_clone", {
      url: "https://github.com/sourcegraph/shadowbox.git",
    });
    expect(execute).toHaveBeenNthCalledWith(3, "git", "git_clone", {
      url: "https://github.com/sourcegraph/shadowbox.git",
      replaceExisting: true,
    });
  });

  it("returns a friendly sync failure when replace clone still fails", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        error: "fatal: not a git repository",
      })
      .mockResolvedValueOnce({
        success: false,
        error:
          "fatal: destination path '/home/sandbox/runs/run-1' already exists and is not an empty directory.",
      })
      .mockResolvedValueOnce({
        success: false,
        error:
          "fatal: destination path '/home/sandbox/runs/run-1' already exists and is not an empty directory.",
      });
    const service = new WorkspaceBootstrapService({ execute }, 0);

    const result = await service.bootstrap({
      runId: "run-1",
      mode: "git_write",
      repositoryContext: {
        owner: "sourcegraph",
        repo: "shadowbox",
        branch: "dev",
      },
    });

    expect(result.status).toBe("sync-failed");
    expect(result.message).toContain("Workspace initialization conflict");
    expect(result.message).not.toContain("fatal:");
  });

  it("creates branch when switch fails due to missing local branch", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        output: CLEAN_GIT_STATUS_OUTPUT,
      }) // status
      .mockResolvedValueOnce({ success: true }) // fetch
      .mockResolvedValueOnce({
        success: false,
        error: "pathspec 'feature/bootstrap' did not match any file",
      }) // switch
      .mockResolvedValueOnce({
        success: true,
        output: [
          "* main",
          "  remotes/origin/main",
        ].join("\n"),
      }) // branch list (branch missing on local+remote)
      .mockResolvedValueOnce({ success: true }) // create branch
      .mockResolvedValueOnce({ success: true }); // pull (unused because no remote branch)
    const service = new WorkspaceBootstrapService({ execute }, 0);

    const result = await service.bootstrap({
      runId: "run-1",
      mode: "git_write",
      repositoryContext: {
        owner: "sourcegraph",
        repo: "shadowbox",
        branch: "feature/bootstrap",
      },
    });

    expect(result.status).toBe("ready");
    expect(execute).toHaveBeenCalledWith("git", "git_branch_list", {});
    expect(execute).toHaveBeenCalledWith("git", "git_branch_create", {
      branch: "feature/bootstrap",
    });
  });

  it("skips git sync when the same run/repo/branch was recently bootstrapped", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        output: CLEAN_GIT_STATUS_OUTPUT,
      }) // first status
      .mockResolvedValueOnce({ success: true }) // first fetch
      .mockResolvedValueOnce({ success: true }) // first switch
      .mockResolvedValueOnce({ success: true }); // first pull
    const service = new WorkspaceBootstrapService({ execute }, 60_000);
    const request = {
      runId: "run-cache-test",
      mode: "git_write",
      repositoryContext: {
        owner: "sourcegraph",
        repo: "shadowbox",
        branch: "dev",
      },
    } as const;

    const firstResult = await service.bootstrap(request);
    const secondResult = await service.bootstrap(request);

    expect(firstResult.status).toBe("ready");
    expect(secondResult.status).toBe("ready");
    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute).toHaveBeenNthCalledWith(1, "git", "git_status", {});
    expect(execute).toHaveBeenNthCalledWith(2, "git", "git_fetch", {
      remote: "origin",
    });
    expect(execute).toHaveBeenNthCalledWith(3, "git", "git_branch_switch", {
      branch: "dev",
    });
    expect(execute).toHaveBeenNthCalledWith(4, "git", "git_pull", {
      remote: "origin",
      branch: "dev",
    });
  });

  it("skips fetch and pull when the existing workspace has local changes", async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      success: true,
      output: JSON.stringify({
        branch: "main",
        files: [
          {
            path: "README.md",
            status: "modified",
            additions: 1,
            deletions: 0,
            isStaged: false,
          },
        ],
        ahead: 0,
        behind: 0,
        repoIdentity: "github.com/sourcegraph/shadowbox",
        hasStaged: false,
        hasUnstaged: true,
        gitAvailable: true,
      }),
    });
    const service = new WorkspaceBootstrapService({ execute }, 0);

    const result = await service.bootstrap({
      runId: "run-dirty",
      mode: "git_write",
      repositoryContext: {
        owner: "sourcegraph",
        repo: "shadowbox",
        branch: "main",
      },
    });

    expect(result.status).toBe("ready");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith("git", "git_status", {});
  });

  it("does not short-circuit ready when local changes are on a different branch", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        output: JSON.stringify({
          branch: "feature/other",
          files: [
            {
              path: "README.md",
              status: "modified",
              additions: 1,
              deletions: 0,
              isStaged: false,
            },
          ],
          ahead: 0,
          behind: 0,
          repoIdentity: "github.com/sourcegraph/shadowbox",
          hasStaged: false,
          hasUnstaged: true,
          gitAvailable: true,
        }),
      })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true });
    const service = new WorkspaceBootstrapService({ execute }, 0);

    const result = await service.bootstrap({
      runId: "run-branch-mismatch",
      mode: "git_write",
      repositoryContext: {
        owner: "sourcegraph",
        repo: "shadowbox",
        branch: "main",
      },
    });

    expect(result.status).toBe("ready");
    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute).toHaveBeenNthCalledWith(2, "git", "git_fetch", {
      remote: "origin",
    });
  });

  it("fails closed on malformed git status payloads", async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      success: true,
      output: "{not-json",
    });
    const service = new WorkspaceBootstrapService({ execute }, 0);

    const result = await service.bootstrap({
      runId: "run-invalid-status",
      mode: "git_write",
      repositoryContext: {
        owner: "sourcegraph",
        repo: "shadowbox",
        branch: "main",
      },
    });

    expect(result.status).toBe("sync-failed");
    expect(result.message).toContain("Invalid git status response");
  });

  it("fails closed on non-string malformed git status payloads", async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      success: true,
      output: { branch: "main" },
    });
    const service = new WorkspaceBootstrapService({ execute }, 0);

    const result = await service.bootstrap({
      runId: "run-invalid-object-status",
      mode: "git_write",
      repositoryContext: {
        owner: "sourcegraph",
        repo: "shadowbox",
        branch: "main",
      },
    });

    expect(result.status).toBe("sync-failed");
    expect(result.message).toContain("Invalid git status response");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("does not short-circuit ready when local changes belong to a different repo identity", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        output: JSON.stringify({
          branch: "main",
          files: [
            {
              path: "README.md",
              status: "modified",
              additions: 1,
              deletions: 0,
              isStaged: false,
            },
          ],
          ahead: 0,
          behind: 0,
          repoIdentity: "github.com/sourcegraph/other-repo",
          hasStaged: false,
          hasUnstaged: true,
          gitAvailable: true,
        }),
      })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true });
    const service = new WorkspaceBootstrapService({ execute }, 0);

    const result = await service.bootstrap({
      runId: "run-repo-mismatch",
      mode: "git_write",
      repositoryContext: {
        owner: "sourcegraph",
        repo: "shadowbox",
        branch: "main",
      },
    });

    expect(result.status).toBe("ready");
    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute).toHaveBeenNthCalledWith(2, "git", "git_fetch", {
      remote: "origin",
    });
  });
});
