import type {
  RepositoryContext,
  WorkspaceBootstrapResult,
  WorkspaceBootstrapper,
} from "../types.js";
import type { PermissionApprovalStore } from "./PermissionApprovalStore.js";
import {
  detectCrossRepoTarget,
  formatCrossRepoApprovalGrantedMessage,
  formatCrossRepoApprovalMessage,
  formatDestructiveApprovalGrantedMessage,
  formatDestructiveApprovalMessage,
  getSelectedRepoRef,
  isDestructiveActionPrompt,
  parsePermissionApprovalDirective,
} from "./RepositoryPermissionPolicy.js";
import { hasRepositorySelection } from "./ConversationPolicy.js";

export async function processPermissionDirectives(
  prompt: string,
  permissionApprovalStore: PermissionApprovalStore,
): Promise<string | null> {
  const directive = parsePermissionApprovalDirective(prompt);
  if (!directive.isApprovalOnlyPrompt) {
    return null;
  }

  const approvalMessages: string[] = [];

  if (directive.crossRepo) {
    await permissionApprovalStore.grantCrossRepo(
      directive.crossRepo.repoRef,
      directive.crossRepo.ttlMs,
    );
    approvalMessages.push(
      formatCrossRepoApprovalGrantedMessage(
        directive.crossRepo.repoRef,
        directive.crossRepo.ttlMs,
      ),
    );
  }

  if (directive.destructive) {
    await permissionApprovalStore.grantDestructive(directive.destructive.ttlMs);
    approvalMessages.push(
      formatDestructiveApprovalGrantedMessage(directive.destructive.ttlMs),
    );
  }

  if (approvalMessages.length === 0) {
    return null;
  }

  return `${approvalMessages.join(" ")} Re-send your repository action to continue.`;
}

export async function getPermissionPolicyMessage(
  prompt: string,
  repositoryContext: RepositoryContext | undefined,
  permissionApprovalStore: PermissionApprovalStore,
): Promise<string | null> {
  const selectedRepoRef = getSelectedRepoRef(repositoryContext);
  const crossRepoTarget = detectCrossRepoTarget(prompt, selectedRepoRef);

  if (crossRepoTarget) {
    const allowed = await permissionApprovalStore.hasCrossRepo(crossRepoTarget);
    if (!allowed) {
      return formatCrossRepoApprovalMessage(crossRepoTarget, selectedRepoRef);
    }
  }

  if (isDestructiveActionPrompt(prompt)) {
    const allowed = await permissionApprovalStore.hasDestructive();
    if (!allowed) {
      return formatDestructiveApprovalMessage();
    }
  }

  return null;
}

export async function getWorkspaceBootstrapMessage(
  runId: string,
  repositoryContext: RepositoryContext | undefined,
  workspaceBootstrapper: WorkspaceBootstrapper | undefined,
): Promise<string | null> {
  if (!repositoryContext || !workspaceBootstrapper) {
    return null;
  }

  if (!hasRepositorySelection(repositoryContext)) {
    return "I need a valid repository selection before I can run repository actions. Please reselect the repository and try again.";
  }

  try {
    const bootstrapResult = await workspaceBootstrapper.bootstrap({
      runId,
      repositoryContext,
    });
    return mapBootstrapResultToMessage(bootstrapResult, repositoryContext);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "workspace bootstrap failed";
    const repoRef = describeRepositoryRef(repositoryContext);
    return `I couldn't prepare the workspace for ${repoRef}. ${errorMessage}`;
  }
}

function mapBootstrapResultToMessage(
  bootstrapResult: WorkspaceBootstrapResult,
  repositoryContext: RepositoryContext,
): string | null {
  if (bootstrapResult.status === "ready") {
    return null;
  }

  if (bootstrapResult.status === "needs-auth") {
    return (
      bootstrapResult.message ??
      "I need GitHub authorization before I can access this repository. Please reconnect GitHub and try again."
    );
  }

  if (bootstrapResult.status === "invalid-context") {
    return (
      bootstrapResult.message ??
      "I need valid repository details (owner, repository, branch) before I can continue."
    );
  }

  const repoRef = describeRepositoryRef(repositoryContext);
  const reason =
    bootstrapResult.message ??
    "Repository sync failed. Please confirm the branch exists and retry.";
  return `I couldn't prepare the workspace for ${repoRef}. ${reason}`;
}

function describeRepositoryRef(repositoryContext: RepositoryContext): string {
  const owner = repositoryContext.owner?.trim() || "unknown-owner";
  const repo = repositoryContext.repo?.trim() || "unknown-repo";
  const branch = repositoryContext.branch?.trim();
  return branch ? `${owner}/${repo}@${branch}` : `${owner}/${repo}`;
}
