import { describe, expect, it } from "vitest";
import { GitHubTaskStrategy } from "./GitHubTaskStrategy.js";

describe("GitHubTaskStrategy", () => {
  const strategy = new GitHubTaskStrategy();

  it("routes CI inspection prompts to inspect_ci", () => {
    const decision = strategy.decide({
      userRequest: "check CI checks for PR 228",
      runMode: "build",
      repositoryReady: true,
      hasGitHubAuth: true,
      connectorAvailable: true,
    });

    expect(decision).toEqual({
      classification: "inspect_ci",
      preferredLane: "github_connector",
      fallbackLane: "github_cli",
      rationale:
        "This request is inspection-only for CI/PR/review state, so keep it read-only.",
    });
  });

  it("routes review-comment inspection prompts to inspect_review", () => {
    const decision = strategy.decide({
      userRequest: "are there any review comments on this PR",
      runMode: "build",
      repositoryReady: true,
      hasGitHubAuth: true,
      connectorAvailable: true,
    });

    expect(decision.classification).toBe("inspect_review");
    expect(decision.preferredLane).toBe("github_connector");
    expect(decision.fallbackLane).toBe("github_cli");
  });

  it("routes publish asks to mutate_publish", () => {
    const decision = strategy.decide({
      userRequest: "commit and push current changes",
      runMode: "build",
      repositoryReady: true,
      hasGitHubAuth: true,
      connectorAvailable: true,
    });

    expect(decision).toEqual({
      classification: "mutate_publish",
      preferredLane: "shell_git",
      fallbackLane: "typed_git",
      rationale:
        "The request explicitly asks for publish-oriented git mutations (stage/commit/push/branch/PR), so route through mutation lanes.",
    });
  });

  it("routes fix requests to mutate_fix", () => {
    const decision = strategy.decide({
      userRequest: "fix failing tests in this PR",
      runMode: "build",
      repositoryReady: true,
      hasGitHubAuth: true,
      connectorAvailable: true,
    });

    expect(decision).toEqual({
      classification: "mutate_fix",
      preferredLane: "shell_git",
      fallbackLane: "typed_git",
      rationale:
        "The request asks for code changes or fixes, so keep a mutation-capable local lane.",
    });
  });

  it("treats add-style mutation verbs as mutate_fix", () => {
    const decision = strategy.decide({
      userRequest: "add tests to this PR",
      runMode: "build",
      repositoryReady: true,
      hasGitHubAuth: true,
      connectorAvailable: true,
    });

    expect(decision.classification).toBe("mutate_fix");
  });

  it("keeps branch inspection prompts in inspect lanes", () => {
    const decision = strategy.decide({
      userRequest: "what branch is this PR on?",
      runMode: "build",
      repositoryReady: true,
      hasGitHubAuth: true,
      connectorAvailable: true,
    });

    expect(decision.classification).toBe("inspect_pr");
  });

  it("keeps missing-scope retries in inspect-only mode", () => {
    const decision = strategy.decide({
      userRequest: "check CI checks for PR 231",
      runMode: "build",
      repositoryReady: true,
      hasGitHubAuth: true,
      connectorAvailable: true,
      currentFailure: {
        kind: "missing_scope_state",
        toolName: "github_cli_actions_run_get",
      },
    });

    expect(decision).toEqual({
      classification: "inspect_ci",
      preferredLane: "github_connector",
      fallbackLane: "github_cli",
      rationale:
        "The previous attempt failed on remote metadata access. Keep this turn in inspect-only mode and avoid mutation lanes until the user explicitly asks to fix or publish.",
    });
  });

  it("prefers github_cli when connector is unavailable", () => {
    const decision = strategy.decide({
      userRequest: "check CI checks for PR 231",
      runMode: "build",
      repositoryReady: true,
      hasGitHubAuth: true,
      connectorAvailable: false,
    });

    expect(decision.preferredLane).toBe("github_cli");
    expect(decision.fallbackLane).toBe("github_connector");
  });
});
