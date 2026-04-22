import { describe, expect, it } from "vitest";
import type { Branch } from "../../services/GitHubService";
import { sortBranchesForRepoPicker } from "./sortBranchesForRepoPicker";

function createBranch(name: string, isProtected = false): Branch {
  return {
    name,
    protected: isProtected,
    commit: {
      sha: `${name}-sha`,
      url: `https://example.com/${name}`,
    },
  };
}

describe("sortBranchesForRepoPicker", () => {
  it("pins the repository default branch to the top", () => {
    const sorted = sortBranchesForRepoPicker(
      [createBranch("develop"), createBranch("main"), createBranch("feature/a")],
      "main",
    );

    expect(sorted.map((branch) => branch.name)).toEqual([
      "main",
      "develop",
      "feature/a",
    ]);
  });

  it("keeps protected branches ahead of non-protected after default branch", () => {
    const sorted = sortBranchesForRepoPicker(
      [
        createBranch("feature/z"),
        createBranch("main"),
        createBranch("release", true),
        createBranch("develop", true),
      ],
      "main",
    );

    expect(sorted.map((branch) => branch.name)).toEqual([
      "main",
      "develop",
      "release",
      "feature/z",
    ]);
  });
});
