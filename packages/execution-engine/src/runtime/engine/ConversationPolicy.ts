import type { RepositoryContext } from "../types.js";

export function hasRepositorySelection(
  repositoryContext?: RepositoryContext,
): boolean {
  return Boolean(repositoryContext?.owner?.trim() && repositoryContext.repo?.trim());
}
