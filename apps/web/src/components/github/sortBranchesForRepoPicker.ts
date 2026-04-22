import type { Branch } from "../../services/GitHubService";

export function sortBranchesForRepoPicker(
  branches: Branch[],
  defaultBranch: string,
): Branch[] {
  const normalizedDefaultBranch = defaultBranch.trim();

  return [...branches].sort((a, b) => {
    const aIsDefault = a.name === normalizedDefaultBranch;
    const bIsDefault = b.name === normalizedDefaultBranch;

    if (aIsDefault && !bIsDefault) {
      return -1;
    }

    if (!aIsDefault && bIsDefault) {
      return 1;
    }

    if (a.protected && !b.protected) {
      return -1;
    }

    if (!a.protected && b.protected) {
      return 1;
    }

    return a.name.localeCompare(b.name);
  });
}
