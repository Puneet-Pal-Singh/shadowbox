import { describe, expect, it } from "vitest";
import {
  describeGitHubScopeBoundaryError,
  parseGitHubScopeList,
  resolveGitHubScopeBoundary,
} from "./GitHubScopeMatrix";

describe("GitHubScopeMatrix", () => {
  it("normalizes scope strings and arrays into lowercase unique values", () => {
    expect(parseGitHubScopeList("repo, read:user user:email repo")).toEqual([
      "repo",
      "read:user",
      "user:email",
    ]);
    expect(parseGitHubScopeList(["repo", " REPO ", "workflow"])).toEqual([
      "repo",
      "workflow",
    ]);
  });

  it("returns null boundary when persisted scopes satisfy required capability", () => {
    const boundary = resolveGitHubScopeBoundary({
      plugin: "github_cli",
      action: "actions_job_logs_get",
      persistedScopes: ["repo", "read:user"],
    });
    expect(boundary).toBeNull();
  });

  it("treats null scope state as unknown but enforces explicit empty scope lists", () => {
    const nullBoundary = resolveGitHubScopeBoundary({
      plugin: "github_cli",
      action: "actions_job_logs_get",
      persistedScopes: null,
    });
    expect(nullBoundary).toBeNull();

    const emptyBoundary = resolveGitHubScopeBoundary({
      plugin: "github_cli",
      action: "actions_job_logs_get",
      persistedScopes: [],
    });
    expect(emptyBoundary).toEqual({
      capability: "actions_read_access",
      requiredAnyOf: ["repo", "workflow", "actions:read"],
      grantedScopes: [],
      rationale: expect.stringContaining("Actions run and log retrieval"),
    });
  });

  it("returns deterministic boundary when persisted scopes miss required capability", () => {
    const boundary = resolveGitHubScopeBoundary({
      plugin: "github_cli",
      action: "pr_comment",
      persistedScopes: ["read:user", "user:email"],
    });
    expect(boundary).toEqual({
      capability: "pr_comment_write",
      requiredAnyOf: ["repo", "public_repo"],
      grantedScopes: ["read:user", "user:email"],
      rationale: expect.stringContaining("Pull-request commenting"),
    });

    expect(
      describeGitHubScopeBoundaryError("github_cli", "pr_comment", boundary!),
    ).toContain("Missing GitHub OAuth scope");
  });
});
