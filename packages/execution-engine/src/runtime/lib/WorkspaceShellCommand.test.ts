import { describe, expect, it } from "vitest";
import {
  normalizeWorkspaceShellCommand,
  resolveWorkspaceRelativeShellPath,
} from "./WorkspaceShellCommand.js";

describe("WorkspaceShellCommand", () => {
  it("extracts a relative cwd from a leading cd command", () => {
    expect(
      normalizeWorkspaceShellCommand({
        command: "cd apps/web && pnpm lint",
      }),
    ).toEqual({
      command: "pnpm lint",
      cwd: "apps/web",
    });
  });

  it("drops invalid absolute local-machine repo paths from leading cd commands", () => {
    expect(
      normalizeWorkspaceShellCommand({
        command:
          "cd /home/user/repos/career-crew && npx next lint --file src/app/page.tsx",
      }),
    ).toEqual({
      command: "npx next lint --file src/app/page.tsx",
    });
  });

  it("converts sandbox workspace absolute paths into repo-relative cwd values", () => {
    expect(
      normalizeWorkspaceShellCommand({
        command:
          "cd /home/sandbox/runs/run-123/apps/web && pnpm test -- --runInBand",
      }),
    ).toEqual({
      command: "pnpm test -- --runInBand",
      cwd: "apps/web",
    });
  });

  it("resolves ls shortcut paths relative to the normalized cwd", () => {
    expect(resolveWorkspaceRelativeShellPath("apps/web", ".")).toBe("apps/web");
    expect(resolveWorkspaceRelativeShellPath("apps/web", "src")).toBe(
      "apps/web/src",
    );
  });
});
