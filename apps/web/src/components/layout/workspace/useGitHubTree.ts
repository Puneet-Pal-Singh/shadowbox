import { useState, useEffect } from "react";
import { getRepositoryTree } from "../../../services/GitHubService";
import { useGitHub } from "../../github/GitHubContextProvider";

export function useGitHubTree(expectedRepo?: string) {
  const { repo, branch, isLoaded: isGitHubLoaded } = useGitHub();
  const [repoTree, setRepoTree] = useState<
    Array<{ path: string; type: string; sha: string }>
  >([]);
  const [isLoadingTree, setIsLoadingTree] = useState(false);

  // If the current context doesn't match the expected repo, we are in a loading/switching state
  const isContextMismatch = expectedRepo && repo?.full_name !== expectedRepo;

  useEffect(() => {
    if (isContextMismatch) {
      console.log(`[useGitHubTree] Context mismatch: expected ${expectedRepo}, got ${repo?.full_name}`);
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
