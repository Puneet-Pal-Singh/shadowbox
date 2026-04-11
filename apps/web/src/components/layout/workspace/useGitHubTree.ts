import { useState, useEffect } from "react";
import { getRepositoryTree } from "../../../services/GitHubService";
import { useGitHub } from "../../github/GitHubContextProvider";

function normalizeRepoIdentifier(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function getRepoName(value: string | undefined): string {
  const normalizedValue = normalizeRepoIdentifier(value);
  if (!normalizedValue) {
    return "";
  }

  const segments = normalizedValue.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

function doesRepoContextMatch(
  expectedRepo: string | undefined,
  actualFullName: string | undefined,
): boolean {
  const normalizedExpectedRepo = normalizeRepoIdentifier(expectedRepo);
  const normalizedActualFullName = normalizeRepoIdentifier(actualFullName);

  if (!normalizedExpectedRepo) {
    return true;
  }

  if (!normalizedActualFullName) {
    return false;
  }

  if (normalizedExpectedRepo.includes("/")) {
    return normalizedExpectedRepo === normalizedActualFullName;
  }

  return getRepoName(normalizedExpectedRepo) === getRepoName(normalizedActualFullName);
}

export function useGitHubTree(expectedRepo?: string) {
  const { repo, branch, isLoaded: isGitHubLoaded } = useGitHub();
  const [repoTree, setRepoTree] = useState<
    Array<{ path: string; type: string; sha: string }>
  >([]);
  const [isLoadingTree, setIsLoadingTree] = useState(false);

  // If the current context doesn't match the expected repo, we are in a loading/switching state
  const isContextMismatch = !doesRepoContextMatch(expectedRepo, repo?.full_name);

  useEffect(() => {
    if (isContextMismatch) {
      console.log(`[useGitHubTree] Context mismatch: expected ${expectedRepo}, got ${repo?.full_name}`);
      setRepoTree([]);
      return;
    }

    if (!repo || !isGitHubLoaded) {
      console.log("[useGitHubTree] No repo or not loaded yet, clearing tree");
      setRepoTree([]);
      return;
    }

    const fetchTree = async () => {
      console.log("[useGitHubTree] Fetching tree for:", repo.full_name, branch);
      setIsLoadingTree(true);
      try {
        const tree = await getRepositoryTree(
          repo.owner.login,
          repo.name,
          branch,
        );
        console.log("[useGitHubTree] Fetched tree with", tree.length, "items");
        setRepoTree(tree);
      } catch (error) {
        console.error("[useGitHubTree] Failed to fetch repository tree:", error);
        setRepoTree([]);
      } finally {
        setIsLoadingTree(false);
      }
    };

    fetchTree();
  }, [repo, branch, isGitHubLoaded, expectedRepo, isContextMismatch]);

  return {
    repoTree,
    isLoadingTree: isLoadingTree || isContextMismatch,
    repo,
    branch,
    isGitHubLoaded,
  };
}
