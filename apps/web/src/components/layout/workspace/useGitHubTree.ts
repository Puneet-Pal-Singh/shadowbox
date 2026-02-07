import { useState, useEffect } from "react";
import { getRepositoryTree } from "../../../services/GitHubService";
import { useGitHub } from "../../github/GitHubContextProvider";

export function useGitHubTree() {
  const { repo, branch, isLoaded: isGitHubLoaded } = useGitHub();
  const [repoTree, setRepoTree] = useState<
    Array<{ path: string; type: string; sha: string }>
  >([]);
  const [isLoadingTree, setIsLoadingTree] = useState(false);

  useEffect(() => {
    console.log("[Workspace] GitHub context changed:", {
      repo: repo?.full_name,
      branch,
      isGitHubLoaded,
    });

    if (!repo || !isGitHubLoaded) {
      console.log("[Workspace] No repo or not loaded yet, clearing tree");
      setRepoTree([]);
      return;
    }

    const fetchTree = async () => {
      console.log("[Workspace] Fetching tree for:", repo.full_name, branch);
      setIsLoadingTree(true);
      try {
        const tree = await getRepositoryTree(
          repo.owner.login,
          repo.name,
          branch,
        );
        console.log("[Workspace] Fetched tree with", tree.length, "items");
        setRepoTree(tree);
      } catch (error) {
        console.error("[Workspace] Failed to fetch repository tree:", error);
        setRepoTree([]);
      } finally {
        setIsLoadingTree(false);
      }
    };

    fetchTree();
  }, [repo, branch, isGitHubLoaded]);

  return {
    repoTree,
    isLoadingTree,
    repo,
    branch,
    isGitHubLoaded,
  };
}
