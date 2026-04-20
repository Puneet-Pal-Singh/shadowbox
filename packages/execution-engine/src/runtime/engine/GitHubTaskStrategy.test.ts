import { describe, expect, it } from "vitest";
import { GitHubTaskStrategy } from "./GitHubTaskStrategy.js";

describe("GitHubTaskStrategy", () => {
  const strategy = new GitHubTaskStrategy();

  it("prefers shell-first for local git checkout tasks", () => {
    const decision = strategy.decide({
      userRequest: "fetch origin and checkout the feature branch locally",
      runMode: "build",
      repositoryReady: true,
      hasGitHubAuth: true,
      connectorAvailable: true,
    });

    expect(decision).toEqual({
      classification: "local_checkout",
      preferredLane: "shell_git",
      fallbackLane: "typed_git",
      rationale:
        "Checkout and branch state tasks should stay shell-first for flexible local recovery.",
    });
  });

  it("prefers connector lane for remote metadata tasks", () => {
    const decision = strategy.decide({
      userRequest: "inspect PR 228 checks and review comments",
      runMode: "build",
      repositoryReady: true,
      hasGitHubAuth: true,
      connectorAvailable: true,
    });

    expect(decision.classification).toBe("remote_metadata");
    expect(decision.preferredLane).toBe("github_connector");
    expect(decision.fallbackLane).toBe("shell_git");
  });

  it("classifies hybrid PR/CI tasks as connector-first with shell fallback", () => {
    const decision = strategy.decide({
      userRequest:
        "check PR 228 failing CI and then patch the code to fix tests",
      runMode: "build",
      repositoryReady: true,
      hasGitHubAuth: true,
      connectorAvailable: true,
    });

    expect(decision).toEqual({
      classification: "hybrid_pr_ci",
      preferredLane: "github_connector",
      fallbackLane: "shell_git",
      rationale:
        "Hybrid PR/CI flow should start with connector metadata and continue with shell-first local repair.",
    });
  });

  it("stays connector-first when connector health is uncertain", () => {
    const decision = strategy.decide({
      userRequest: "show PR 228 checks and comments",
      runMode: "build",
      repositoryReady: true,
      hasGitHubAuth: true,
      connectorAvailable: false,
    });

    expect(decision.classification).toBe("connector_gap");
    expect(decision.preferredLane).toBe("github_connector");
  });

  it("anchors remote planning turns on connector metadata", () => {
    const decision = strategy.decide({
      userRequest: "plan how to investigate PR 228 failures",
      runMode: "plan",
      repositoryReady: true,
      hasGitHubAuth: false,
      connectorAvailable: true,
    });

    expect(decision.classification).toBe("remote_metadata");
    expect(decision.preferredLane).toBe("github_connector");
    expect(decision.fallbackLane).toBe("shell_git");
  });
});
