import { describe, expect, it, vi } from "vitest";
import { WorkspaceBootstrapService } from "./WorkspaceBootstrapService";

describe("WorkspaceBootstrapService", () => {
  it("returns invalid-context when owner/repo are missing", async () => {
    const execute = vi.fn(async () => ({ success: true }));
    const service = new WorkspaceBootstrapService({ execute });

    const result = await service.bootstrap({
      runId: "run-1",
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
    const service = new WorkspaceBootstrapService({ execute });

    const result = await service.bootstrap({
      runId: "run-1",
      repositoryContext: {
        owner: "sourcegraph",
        repo: "shadowbox",
        branch: "dev",
      },
    });

    expect(result.status).toBe("ready");
    expect(execute).toHaveBeenNthCalledWith(
      1,
      "git",
      "git_status",
      {},
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      "git",
      "git_clone",
      { url: "https://github.com/sourcegraph/shadowbox.git" },
    );
  });

  it("returns needs-auth on git authentication failures", async () => {
    const execute = vi.fn(async () => ({
      success: false,
      error: "remote: Permission to private/repo denied to user",
    }));
    const service = new WorkspaceBootstrapService({ execute });

    const result = await service.bootstrap({
      runId: "run-1",
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
    const service = new WorkspaceBootstrapService({ execute });

    const result = await service.bootstrap({
      runId: "run-1",
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
    const service = new WorkspaceBootstrapService({ execute });

    const result = await service.bootstrap({
      runId: "run-1",
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
      .mockResolvedValueOnce({ success: true }) // status
      .mockResolvedValueOnce({ success: true }) // fetch
      .mockResolvedValueOnce({
        success: false,
        error: "pathspec 'feature/bootstrap' did not match any file",
      })
      .mockResolvedValueOnce({ success: true }) // create branch
      .mockResolvedValueOnce({
        success: false,
        error: "fatal: couldn't find remote ref feature/bootstrap",
      }); // pull is allowed to fail for a fresh branch
    const service = new WorkspaceBootstrapService({ execute });

    const result = await service.bootstrap({
      runId: "run-1",
      repositoryContext: {
        owner: "sourcegraph",
        repo: "shadowbox",
        branch: "feature/bootstrap",
      },
    });

    expect(result.status).toBe("ready");
    expect(execute).toHaveBeenCalledWith(
      "git",
      "git_branch_create",
      { branch: "feature/bootstrap" },
    );
  });
});
