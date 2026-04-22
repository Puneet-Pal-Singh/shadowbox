import type { WorkspaceBootstrapEvaluation } from "./RunPermissionWorkspacePolicy.js";

export function describeWorkspaceBootstrapSummary(
  evaluation: WorkspaceBootstrapEvaluation,
): string {
  if (evaluation.status === "skipped") {
    return "Repository bootstrap was skipped because no repository context was provided for this run.";
  }

  if (evaluation.blocked) {
    if (evaluation.expectedMiss) {
      return "Repository bootstrap reported an expected startup miss and paused execution until workspace checkout is available.";
    }
    return (
      evaluation.message ??
      "Repository bootstrap blocked execution because the workspace is not ready."
    );
  }

  if (evaluation.mode) {
    return `Repository bootstrap is ready for ${evaluation.mode} actions.`;
  }

  return "Repository bootstrap is ready.";
}
