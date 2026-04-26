import { describe, expect, it } from "vitest";
import {
  GitToolFailureClassifier,
  shouldClassifyAsGitOrShellFailure,
} from "./GitToolFailureClassifier.js";

describe("GitToolFailureClassifier", () => {
  const classifier = new GitToolFailureClassifier();

  it("classifies bad git refs as recoverable checkout failures", () => {
    expect(
      classifier.classify({
        toolName: "bash",
        message: "fatal: couldn't find remote ref pull/228/head",
        metadata: {
          family: "shell",
          command: "git fetch origin pull/228/head:pr228",
          origin: "agent_tool",
          truncated: false,
        },
      }),
    ).toEqual({
      kind: "bad_ref_or_checkout",
      terminal: false,
    });
  });

  it("classifies checkout-overwrite conflicts as recoverable checkout failures", () => {
    expect(
      classifier.classify({
        toolName: "git_branch_switch",
        message:
          "error: Your local changes to the following files would be overwritten by checkout:\n\tsrc/components/layout/Footer.tsx\nPlease commit your changes or stash them before you switch branches.\nAborting",
      }),
    ).toEqual({
      kind: "bad_ref_or_checkout",
      terminal: false,
    });
  });

  it("classifies auth failures as recoverable missing-auth state", () => {
    expect(
      classifier.classify({
        toolName: "git_push",
        message: "remote: repository not found",
      }),
    ).toEqual({
      kind: "missing_auth_state",
      terminal: false,
    });
  });

  it("classifies scope-boundary failures as terminal missing-scope state", () => {
    expect(
      classifier.classify({
        toolName: "github_cli_actions_job_logs_get",
        message:
          "GitHub CLI request was forbidden (403) due to insufficient token scope or permissions.",
      }),
    ).toEqual({
      kind: "missing_scope_state",
      terminal: true,
    });
  });

  it("marks policy denials as terminal", () => {
    expect(
      classifier.classify({
        toolName: "bash",
        message: "Shadowbox wants to run a shell command that needs approval",
      }),
    ).toEqual({
      kind: "policy_blocked",
      terminal: true,
    });
  });

  it("marks 'cannot continue' policy guardrails as terminal", () => {
    expect(
      classifier.classify({
        toolName: "git_push",
        message:
          "Shadowbox cannot continue with git stage/commit/push yet because no successful file mutation has occurred in this run.",
      }),
    ).toEqual({
      kind: "policy_blocked",
      terminal: true,
    });
  });

  it("marks sandbox shell safety blocks as terminal", () => {
    expect(
      classifier.classify({
        toolName: "bash",
        message: "Dangerous bash command pattern detected",
      }),
    ).toEqual({
      kind: "policy_blocked",
      terminal: true,
    });
  });

  it("defaults to recoverable command failures for ordinary shell errors", () => {
    expect(
      classifier.classify({
        toolName: "bash",
        message: "exit code 1: npm test failed",
        metadata: {
          family: "shell",
          command: "npm test",
          origin: "agent_tool",
          truncated: false,
          stderr: "1 test failed",
        },
      }),
    ).toEqual({
      kind: "recoverable_command_failure",
      terminal: false,
    });
  });
});

describe("shouldClassifyAsGitOrShellFailure", () => {
  it("includes branch-switch typed git failures", () => {
    expect(
      shouldClassifyAsGitOrShellFailure({
        toolName: "git_branch_switch",
      }),
    ).toBe(true);
  });

  it("includes bash tool failures", () => {
    expect(
      shouldClassifyAsGitOrShellFailure({
        toolName: "bash",
      }),
    ).toBe(true);
  });

  it("includes shell metadata with git or gh commands", () => {
    expect(
      shouldClassifyAsGitOrShellFailure({
        toolName: "read_file",
        metadata: {
          family: "shell",
          command: "gh pr checks 228",
          origin: "agent_tool",
          truncated: false,
        },
      }),
    ).toBe(true);
  });

  it("includes github and github_cli tool failures", () => {
    expect(
      shouldClassifyAsGitOrShellFailure({
        toolName: "github_actions_job_logs_get",
      }),
    ).toBe(true);
    expect(
      shouldClassifyAsGitOrShellFailure({
        toolName: "github_cli_pr_comment",
      }),
    ).toBe(true);
  });

  it("excludes unrelated non-shell tools", () => {
    expect(
      shouldClassifyAsGitOrShellFailure({
        toolName: "git_push",
      }),
    ).toBe(false);
    expect(
      shouldClassifyAsGitOrShellFailure({
        toolName: "write_file",
        metadata: {
          family: "edit",
          filePath: "README.md",
          additions: 1,
          deletions: 0,
        },
      }),
    ).toBe(false);
  });
});
