import {
  APPROVAL_DECISION_KINDS,
  RISKY_ACTION_CATEGORIES,
  type ApprovalDecisionKind,
  type ApprovalRequest,
  type PermissionEvaluationResult,
  type ProductMode,
  type ProposedPersistentRule,
  type RiskyActionCategory,
  type WorkflowIntent,
} from "@repo/shared-types";
import type { GoldenFlowToolName } from "../contracts/CodingToolGateway.js";
import { PermissionApprovalStore } from "./PermissionApprovalStore.js";

const SHELL_NETWORK_PATTERN =
  /\b(curl|wget|npm\s+install|pnpm\s+add|yarn\s+add|pip\s+install)\b/i;
const SHELL_DEPLOY_PATTERN =
  /\b(wrangler\s+deploy|terraform\s+apply|pulumi\s+up|kubectl\s+apply|serverless\s+deploy)\b/i;
const SHELL_DESTRUCTIVE_PATTERN =
  /\b(rm\s+-rf|git\s+reset\s+--hard|git\s+clean\s+-fd|git\s+push\s+--force)\b/i;
const SAFE_PERSISTENT_SHELL_PREFIXES = new Set([
  "git",
  "pnpm",
  "npm",
  "yarn",
  "ls",
  "pwd",
  "cat",
  "rg",
  "echo",
  "vitest",
]);
const UNSAFE_INTERPRETER_PREFIXES = new Set([
  "bash",
  "sh",
  "zsh",
  "python",
  "python3",
  "node",
  "deno",
  "perl",
  "ruby",
]);
const BROAD_PERSISTENT_SHELL_PREFIXES = new Set(["git", "npm", "pnpm", "yarn"]);
const SHELL_PREFIX_VERB_TOKENS = new Set(["run", "exec", "dlx"]);
const APPROVAL_TTL_MS = 10 * 60 * 1000;
const DANGEROUS_RETRY_THRESHOLD = 3;

export interface RiskyActionEvaluationInput {
  runId: string;
  sessionId: string;
  origin: "user" | "agent";
  productMode: ProductMode;
  workflowIntent: WorkflowIntent;
  toolName: GoldenFlowToolName;
  toolArgs: Record<string, unknown>;
  hasMutationEvidence: boolean;
  approvalStore: PermissionApprovalStore;
}

export interface PermissionAskResult {
  kind: "ask";
  request: ApprovalRequest;
}

export interface PermissionDenyResult {
  kind: "deny";
  reason: string;
}

export type ToolPermissionGateResult =
  | { kind: "allow" }
  | PermissionAskResult
  | PermissionDenyResult;
type PolicyDecisionResult =
  | { kind: "allow" }
  | { kind: "ask" }
  | PermissionDenyResult;

interface ClassifiedRiskAction {
  category: RiskyActionCategory;
  title: string;
  reason: string;
  actionFingerprint: string;
  safeByDefault: boolean;
  command?: string;
  cwd?: string;
  affectedPaths?: string[];
  remoteTarget?: string;
  gitAction?: "stage" | "commit" | "push" | "pull";
  providerOperation?: "validate" | "connect";
  destructive: boolean;
}

export async function evaluateToolPermission(
  input: RiskyActionEvaluationInput,
): Promise<ToolPermissionGateResult> {
  const classified = classifyRiskAction(input.toolName, input.toolArgs);

  const mutationEvidenceDenial = getMutationEvidenceDenial(
    classified,
    input.toolName,
    input.hasMutationEvidence,
  );
  if (mutationEvidenceDenial) {
    return mutationEvidenceDenial;
  }

  if (await hasPreapprovedAction(input.approvalStore, classified)) {
    return { kind: "allow" };
  }

  const policyDecision = decidePolicyOutcome({
    productMode: input.productMode,
    workflowIntent: input.workflowIntent,
    classified,
  });
  if (policyDecision.kind !== "ask") {
    return policyDecision;
  }

  return await createApprovalAskResult(input, classified);
}

export function mapPermissionGateToEvaluationResult(
  result: ToolPermissionGateResult,
): PermissionEvaluationResult {
  if (result.kind === "allow") {
    return { kind: "allow" };
  }
  if (result.kind === "deny") {
    return { kind: "deny", reason: result.reason };
  }
  return { kind: "ask", request: result.request };
}

function requiresMutationEvidence(
  classified: ClassifiedRiskAction,
  toolName: GoldenFlowToolName,
): boolean {
  return (
    classified.category === RISKY_ACTION_CATEGORIES.GIT_MUTATION &&
    (toolName === "git_stage" ||
      toolName === "git_commit" ||
      toolName === "git_push")
  );
}

function getMutationEvidenceDenial(
  classified: ClassifiedRiskAction,
  toolName: GoldenFlowToolName,
  hasMutationEvidence: boolean,
): PermissionDenyResult | null {
  if (
    requiresMutationEvidence(classified, toolName) &&
    !hasMutationEvidence
  ) {
    return {
      kind: "deny",
      reason:
        "Shadowbox cannot continue with git stage/commit/push yet because no successful file mutation has occurred in this run.",
    };
  }

  return null;
}

async function hasPreapprovedAction(
  approvalStore: PermissionApprovalStore,
  classified: ClassifiedRiskAction,
): Promise<boolean> {
  const runApproved = await approvalStore.isActionAllowed(
    classified.actionFingerprint,
  );
  if (runApproved) {
    await approvalStore.clearRiskyAttempt(classified.actionFingerprint);
    return true;
  }

  const persistentApproved = await approvalStore.matchPersistentRule({
    category: classified.category,
    command: classified.command,
    gitAction:
      classified.gitAction === "stage" || classified.gitAction === "commit"
        ? classified.gitAction
        : undefined,
    providerOperation: classified.providerOperation,
  });
  if (persistentApproved) {
    await approvalStore.clearRiskyAttempt(classified.actionFingerprint);
    return true;
  }

  return false;
}

function classifyRiskAction(
  toolName: GoldenFlowToolName,
  toolArgs: Record<string, unknown>,
): ClassifiedRiskAction {
  const affectedPaths = extractCandidatePaths(toolArgs);
  const outsideWorkspace = affectedPaths.some(isOutsideWorkspacePath);
  if (outsideWorkspace) {
    return {
      category: RISKY_ACTION_CATEGORIES.OUTSIDE_WORKSPACE,
      title: "Shadowbox wants to operate outside the workspace",
      reason:
        "This action targets a path outside the current workspace and requires explicit confirmation.",
      affectedPaths,
      actionFingerprint: buildActionFingerprint({
        category: RISKY_ACTION_CATEGORIES.OUTSIDE_WORKSPACE,
        toolName,
        toolArgs,
      }),
      safeByDefault: false,
      destructive: false,
    };
  }

  if (
    toolName === "read_file" ||
    toolName === "list_files" ||
    toolName === "glob" ||
    toolName === "grep" ||
    toolName === "git_status" ||
    toolName === "git_diff"
  ) {
    return {
      category: RISKY_ACTION_CATEGORIES.FILESYSTEM_WRITE,
      title: "Shadowbox wants to inspect repository state",
      reason:
        "This is a read-only exploration action and is allowed under the current policy.",
      affectedPaths,
      actionFingerprint: buildActionFingerprint({
        category: RISKY_ACTION_CATEGORIES.FILESYSTEM_WRITE,
        toolName,
        toolArgs,
      }),
      safeByDefault: true,
      destructive: false,
    };
  }

  if (toolName === "write_file") {
    return {
      category: RISKY_ACTION_CATEGORIES.FILESYSTEM_WRITE,
      title: "Shadowbox wants to edit files",
      reason:
        "This action mutates workspace files and should be confirmed based on your permission mode.",
      affectedPaths,
      actionFingerprint: buildActionFingerprint({
        category: RISKY_ACTION_CATEGORIES.FILESYSTEM_WRITE,
        toolName,
        toolArgs,
      }),
      safeByDefault: false,
      destructive: false,
    };
  }

  if (toolName === "bash") {
    const command =
      typeof toolArgs.command === "string" ? toolArgs.command.trim() : "";
    const cwd = typeof toolArgs.cwd === "string" ? toolArgs.cwd.trim() : ".";
    const destructive = SHELL_DESTRUCTIVE_PATTERN.test(command);
    const deployLike = SHELL_DEPLOY_PATTERN.test(command);
    const networkLike = SHELL_NETWORK_PATTERN.test(command);

    const category = deployLike
      ? RISKY_ACTION_CATEGORIES.DEPLOY_OR_INFRA_MUTATION
      : networkLike
        ? RISKY_ACTION_CATEGORIES.NETWORK_EXTERNAL
        : RISKY_ACTION_CATEGORIES.SHELL_COMMAND;

    return {
      category,
      title: deployLike
        ? "Shadowbox wants to run deployment or infrastructure changes"
        : networkLike
          ? "Shadowbox wants to run a networked shell command"
          : "Shadowbox wants to run a shell command",
      reason: destructive
        ? "This command appears destructive and needs explicit approval."
        : deployLike
          ? "This command can mutate remote infrastructure and should be confirmed."
          : networkLike
            ? "This command may mutate external state or install dependencies."
            : "Shell commands can change repository or environment state and should be confirmed.",
      command,
      cwd,
      actionFingerprint: buildActionFingerprint({
        category,
        toolName,
        toolArgs: { command, cwd },
      }),
      safeByDefault: false,
      destructive,
    };
  }

  if (
    toolName === "git_stage" ||
    toolName === "git_commit" ||
    toolName === "git_push" ||
    toolName === "git_pull" ||
    toolName === "git_create_pull_request" ||
    toolName === "git_branch_create" ||
    toolName === "git_branch_switch"
  ) {
    const gitAction = toGitAction(toolName);
    return {
      category: RISKY_ACTION_CATEGORIES.GIT_MUTATION,
      title: describeGitMutationTitle(toolName),
      reason:
        "Git mutation actions can change repository history and should be explicitly confirmed.",
      affectedPaths,
      remoteTarget: extractRemoteTarget(toolArgs),
      gitAction,
      actionFingerprint: buildActionFingerprint({
        category: RISKY_ACTION_CATEGORIES.GIT_MUTATION,
        toolName,
        toolArgs,
      }),
      safeByDefault: false,
      destructive: toolName === "git_push",
    };
  }

  return {
    category: RISKY_ACTION_CATEGORIES.FILESYSTEM_WRITE,
    title: "Shadowbox wants to run a mutating action",
    reason: "This action mutates workspace state and requires confirmation.",
    actionFingerprint: buildActionFingerprint({
      category: RISKY_ACTION_CATEGORIES.FILESYSTEM_WRITE,
      toolName,
      toolArgs,
    }),
    safeByDefault: false,
    destructive: false,
  };
}

function decidePolicyOutcome(input: {
  productMode: ProductMode;
  workflowIntent: WorkflowIntent;
  classified: ClassifiedRiskAction;
}): PolicyDecisionResult {
  const { productMode, workflowIntent, classified } = input;
  const guaranteedDecision = getGuaranteedDecision(classified);
  if (guaranteedDecision) {
    return guaranteedDecision;
  }

  const workflowDecision = getWorkflowDecision(workflowIntent);
  if (workflowDecision) {
    return workflowDecision;
  }

  return getProductModeDecision(productMode, classified);
}

function getGuaranteedDecision(
  classified: ClassifiedRiskAction,
): PolicyDecisionResult | null {
  if (classified.safeByDefault) {
    return { kind: "allow" };
  }
  if (classified.category === RISKY_ACTION_CATEGORIES.DANGEROUS_RETRY) {
    return { kind: "ask" };
  }
  if (classified.category === RISKY_ACTION_CATEGORIES.OUTSIDE_WORKSPACE) {
    return { kind: "ask" };
  }
  if (classified.destructive) {
    return { kind: "ask" };
  }
  return null;
}

function getWorkflowDecision(
  workflowIntent: WorkflowIntent,
): { kind: "ask" } | null {
  if (workflowIntent === "review" || workflowIntent === "explore") {
    return { kind: "ask" };
  }
  return null;
}

function getProductModeDecision(
  productMode: ProductMode,
  classified: ClassifiedRiskAction,
): PolicyDecisionResult {
  switch (productMode) {
    case "ask_always":
      return { kind: "ask" };
    case "auto_for_safe":
      return isAutoForSafeCategory(classified.category)
        ? { kind: "ask" }
        : { kind: "allow" };
    case "auto_for_same_repo":
      return isSameRepoApprovalCategory(classified.category)
        ? { kind: "ask" }
        : { kind: "allow" };
    case "full_agent":
      return isFullAgentApprovalCategory(classified.category)
        ? { kind: "ask" }
        : { kind: "allow" };
    default:
      return {
        kind: "deny",
        reason: "Unknown product mode. Refusing to run mutating action.",
      };
  }
}

function isAutoForSafeCategory(category: RiskyActionCategory): boolean {
  return (
    category === RISKY_ACTION_CATEGORIES.FILESYSTEM_WRITE ||
    isSameRepoApprovalCategory(category)
  );
}

function isSameRepoApprovalCategory(category: RiskyActionCategory): boolean {
  return (
    category === RISKY_ACTION_CATEGORIES.GIT_MUTATION ||
    category === RISKY_ACTION_CATEGORIES.SHELL_COMMAND ||
    category === RISKY_ACTION_CATEGORIES.NETWORK_EXTERNAL ||
    category === RISKY_ACTION_CATEGORIES.DEPLOY_OR_INFRA_MUTATION
  );
}

function isFullAgentApprovalCategory(category: RiskyActionCategory): boolean {
  return (
    category === RISKY_ACTION_CATEGORIES.GIT_MUTATION ||
    category === RISKY_ACTION_CATEGORIES.NETWORK_EXTERNAL ||
    category === RISKY_ACTION_CATEGORIES.DEPLOY_OR_INFRA_MUTATION
  );
}

async function createApprovalAskResult(
  input: RiskyActionEvaluationInput,
  classified: ClassifiedRiskAction,
): Promise<PermissionAskResult> {
  const attemptCount = await input.approvalStore.registerRiskyAttempt(
    classified.actionFingerprint,
    classified.reason,
  );
  const category =
    attemptCount >= DANGEROUS_RETRY_THRESHOLD
      ? RISKY_ACTION_CATEGORIES.DANGEROUS_RETRY
      : classified.category;
  const proposedPersistentRule = buildProposedPersistentRule(
    classified,
    input.toolName,
  );
  const request = await input.approvalStore.setPendingRequest({
    requestId: crypto.randomUUID(),
    runId: input.runId,
    sessionId: input.sessionId,
    origin: input.origin,
    category,
    title: getApprovalTitle(category, classified),
    reason: getApprovalReason(category, classified),
    command: classified.command,
    cwd: classified.cwd,
    affectedPaths: classified.affectedPaths,
    remoteTarget: classified.remoteTarget,
    actionFingerprint: classified.actionFingerprint,
    availableDecisions: buildAvailableDecisions(
      category,
      Boolean(proposedPersistentRule),
    ),
    proposedPersistentRule: proposedPersistentRule ?? undefined,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + APPROVAL_TTL_MS).toISOString(),
  });
  return { kind: "ask", request };
}

function getApprovalTitle(
  category: RiskyActionCategory,
  classified: ClassifiedRiskAction,
): string {
  return category === RISKY_ACTION_CATEGORIES.DANGEROUS_RETRY
    ? "Shadowbox paused repeated risky retries"
    : classified.title;
}

function getApprovalReason(
  category: RiskyActionCategory,
  classified: ClassifiedRiskAction,
): string {
  return category === RISKY_ACTION_CATEGORIES.DANGEROUS_RETRY
    ? "The same risky action was attempted repeatedly without progress. Confirm how to proceed."
    : classified.reason;
}

function buildAvailableDecisions(
  category: RiskyActionCategory,
  hasPersistentRule: boolean,
) {
  const decisions: ApprovalDecisionKind[] = [
    APPROVAL_DECISION_KINDS.ALLOW_ONCE,
    APPROVAL_DECISION_KINDS.ALLOW_FOR_RUN,
  ];
  if (hasPersistentRule) {
    decisions.push(APPROVAL_DECISION_KINDS.ALLOW_PERSISTENT_RULE);
  }
  decisions.push(APPROVAL_DECISION_KINDS.DENY);
  if (
    category === RISKY_ACTION_CATEGORIES.DANGEROUS_RETRY ||
    category === RISKY_ACTION_CATEGORIES.DEPLOY_OR_INFRA_MUTATION
  ) {
    decisions.push(APPROVAL_DECISION_KINDS.ABORT);
  }
  return decisions;
}

function buildProposedPersistentRule(
  classified: ClassifiedRiskAction,
  toolName: GoldenFlowToolName,
): ProposedPersistentRule | null {
  if (classified.category === RISKY_ACTION_CATEGORIES.SHELL_COMMAND) {
    if (!classified.command) {
      return null;
    }
    const prefixTokens = buildShellPersistentPrefixTokens(classified.command);
    if (!prefixTokens) {
      return null;
    }
    return {
      category: "shell_command",
      prefixTokens,
      cwdScope: "current_repo",
      networkAccess: "none",
    };
  }

  if (classified.category === RISKY_ACTION_CATEGORIES.GIT_MUTATION) {
    if (toolName !== "git_stage" && toolName !== "git_commit") {
      return null;
    }
    return {
      category: "git_mutation",
      allowedActions: [toolName === "git_stage" ? "stage" : "commit"],
      repoScope: "current_repo",
    };
  }

  return null;
}

function buildActionFingerprint(input: {
  category: RiskyActionCategory;
  toolName: string;
  toolArgs: Record<string, unknown>;
}): string {
  return `${input.category}:${input.toolName}:${stableStringify(input.toolArgs)}`;
}

function buildShellPersistentPrefixTokens(command: string): string[] | null {
  const tokens = command
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  const [first, second, third] = tokens;
  if (!first) {
    return null;
  }
  if (UNSAFE_INTERPRETER_PREFIXES.has(first)) {
    return null;
  }
  if (!SAFE_PERSISTENT_SHELL_PREFIXES.has(first)) {
    return null;
  }
  if (!BROAD_PERSISTENT_SHELL_PREFIXES.has(first)) {
    return [first];
  }
  if (!isSafeShellPrefixToken(second)) {
    return null;
  }
  if (SHELL_PREFIX_VERB_TOKENS.has(second)) {
    return isSafeShellPrefixToken(third) ? [first, second, third] : null;
  }
  return [first, second];
}

function isSafeShellPrefixToken(token: string | undefined): token is string {
  return typeof token === "string" && /^[a-z0-9._:-]+$/.test(token);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([leftKey], [rightKey]) => leftKey.localeCompare(rightKey),
  );
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

function extractCandidatePaths(toolArgs: Record<string, unknown>): string[] {
  const candidates: string[] = [];
  const directPath = toolArgs.path;
  if (typeof directPath === "string" && directPath.trim()) {
    candidates.push(directPath.trim());
  }
  const cwd = toolArgs.cwd;
  if (typeof cwd === "string" && cwd.trim()) {
    candidates.push(cwd.trim());
  }
  const files = toolArgs.files;
  if (Array.isArray(files)) {
    for (const file of files) {
      if (typeof file === "string" && file.trim()) {
        candidates.push(file.trim());
      }
    }
  }
  return candidates;
}

function isOutsideWorkspacePath(path: string): boolean {
  return (
    path.startsWith("/") ||
    path.startsWith("..") ||
    path.includes("/../") ||
    path.includes("\\..\\")
  );
}

function toGitAction(
  toolName: GoldenFlowToolName,
): "stage" | "commit" | "push" | "pull" | undefined {
  if (toolName === "git_stage") {
    return "stage";
  }
  if (toolName === "git_commit") {
    return "commit";
  }
  if (toolName === "git_push") {
    return "push";
  }
  if (toolName === "git_pull") {
    return "pull";
  }
  return undefined;
}

function describeGitMutationTitle(toolName: GoldenFlowToolName): string {
  if (toolName === "git_stage") {
    return "Shadowbox wants to stage repository changes";
  }
  if (toolName === "git_commit") {
    return "Shadowbox wants to commit repository changes";
  }
  if (toolName === "git_push") {
    return "Shadowbox wants to push repository changes";
  }
  if (toolName === "git_pull") {
    return "Shadowbox wants to pull from remote";
  }
  if (toolName === "git_create_pull_request") {
    return "Shadowbox wants to create a pull request";
  }
  if (toolName === "git_branch_create") {
    return "Shadowbox wants to create a branch";
  }
  if (toolName === "git_branch_switch") {
    return "Shadowbox wants to switch branches";
  }
  return "Shadowbox wants to mutate git state";
}

function extractRemoteTarget(toolArgs: Record<string, unknown>): string | undefined {
  const owner = typeof toolArgs.owner === "string" ? toolArgs.owner.trim() : "";
  const repo = typeof toolArgs.repo === "string" ? toolArgs.repo.trim() : "";
  if (owner && repo) {
    return `${owner}/${repo}`;
  }
  const remote =
    typeof toolArgs.remote === "string" ? toolArgs.remote.trim() : "";
  if (remote) {
    return remote;
  }
  return undefined;
}
