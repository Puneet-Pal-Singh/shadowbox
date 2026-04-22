import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sandbox } from "@cloudflare/sandbox";
import { GitPlugin } from "./GitPlugin";
import { runSafeCommand } from "./security/SafeCommand";

vi.mock("./security/SafeCommand", () => ({
  runSafeCommand: vi.fn(),
}));

interface SafeCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function asSandbox(): Sandbox {
  return {} as Sandbox;
}

describe("GitPlugin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses --cached when requesting staged diff content", async () => {
    const runSafeCommandMock = vi.mocked(runSafeCommand);
    runSafeCommandMock
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      } satisfies SafeCommandResult)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout:
          "diff --git a/src/example.ts b/src/example.ts\n--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1 @@\n-console.log('old')\n+console.log('new')\n",
        stderr: "",
      } satisfies SafeCommandResult);

    const plugin = new GitPlugin();
    const result = await plugin.execute(asSandbox(), {
      action: "git_diff",
      runId: "run_git_diff_1",
      path: "src/example.ts",
      staged: true,
    });

    expect(result.success).toBe(true);

    const diffCommandSpec = runSafeCommandMock.mock.calls[1]?.[1] as
      | { args?: string[] }
      | undefined;
    expect(diffCommandSpec?.args).toContain("--cached");
    expect(diffCommandSpec?.args).not.toContain("--staged");
  });

  it("hydrates commit identity from GitHub token when local identity is missing", async () => {
    const runSafeCommandMock = vi.mocked(runSafeCommand);
    runSafeCommandMock
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      } satisfies SafeCommandResult)
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: "",
        stderr: "not set",
      } satisfies SafeCommandResult)
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: "",
        stderr: "not set",
      } satisfies SafeCommandResult)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      } satisfies SafeCommandResult)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      } satisfies SafeCommandResult)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "commit ok",
        stderr: "",
      } satisfies SafeCommandResult);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 42,
            login: "puneet",
            name: "Puneet Singh",
            email: null,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              email: "puneet@example.com",
              primary: true,
              verified: true,
            },
          ]),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const plugin = new GitPlugin();
    const result = await plugin.execute(asSandbox(), {
      action: "git_commit",
      runId: "run_git_commit_1",
      message: "fix(runtime): hydrate commit identity from github profile",
      token: "ghp_test",
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/user",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/user/emails",
      expect.any(Object),
    );

    const writeNameArgs = (runSafeCommandMock.mock.calls[3]?.[1] as {
      args?: string[];
    }).args;
    const writeEmailArgs = (runSafeCommandMock.mock.calls[4]?.[1] as {
      args?: string[];
    }).args;
    expect(writeNameArgs).toEqual(
      expect.arrayContaining(["config", "user.name", "Puneet Singh"]),
    );
    expect(writeEmailArgs).toEqual(
      expect.arrayContaining(["config", "user.email", "puneet@example.com"]),
    );
  });
});
