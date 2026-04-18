import { z } from "zod";

export const RISKY_ACTION_CATEGORIES = {
  FILESYSTEM_WRITE: "filesystem_write",
  GIT_MUTATION: "git_mutation",
  SHELL_COMMAND: "shell_command",
  NETWORK_EXTERNAL: "network_external",
  OUTSIDE_WORKSPACE: "outside_workspace",
  SUBAGENT_SPAWN: "subagent_spawn",
  PROVIDER_CONNECT: "provider_connect",
  DEPLOY_OR_INFRA_MUTATION: "deploy_or_infra_mutation",
  DANGEROUS_RETRY: "dangerous_retry",
} as const;

export const RiskyActionCategorySchema = z.enum([
  RISKY_ACTION_CATEGORIES.FILESYSTEM_WRITE,
  RISKY_ACTION_CATEGORIES.GIT_MUTATION,
  RISKY_ACTION_CATEGORIES.SHELL_COMMAND,
  RISKY_ACTION_CATEGORIES.NETWORK_EXTERNAL,
  RISKY_ACTION_CATEGORIES.OUTSIDE_WORKSPACE,
  RISKY_ACTION_CATEGORIES.SUBAGENT_SPAWN,
  RISKY_ACTION_CATEGORIES.PROVIDER_CONNECT,
  RISKY_ACTION_CATEGORIES.DEPLOY_OR_INFRA_MUTATION,
  RISKY_ACTION_CATEGORIES.DANGEROUS_RETRY,
]);

export type RiskyActionCategory = z.infer<typeof RiskyActionCategorySchema>;

export const APPROVAL_DECISION_KINDS = {
  ALLOW_ONCE: "allow_once",
  ALLOW_FOR_RUN: "allow_for_run",
  ALLOW_PERSISTENT_RULE: "allow_persistent_rule",
  DENY: "deny",
  ABORT: "abort",
} as const;

export const ApprovalDecisionKindSchema = z.enum([
  APPROVAL_DECISION_KINDS.ALLOW_ONCE,
  APPROVAL_DECISION_KINDS.ALLOW_FOR_RUN,
  APPROVAL_DECISION_KINDS.ALLOW_PERSISTENT_RULE,
  APPROVAL_DECISION_KINDS.DENY,
  APPROVAL_DECISION_KINDS.ABORT,
]);

export type ApprovalDecisionKind = z.infer<typeof ApprovalDecisionKindSchema>;

export const APPROVAL_RESOLUTION_STATUSES = {
  APPROVED: "approved",
  DENIED: "denied",
  ABORTED: "aborted",
  EXPIRED: "expired",
} as const;

export const ApprovalResolutionStatusSchema = z.enum([
  APPROVAL_RESOLUTION_STATUSES.APPROVED,
  APPROVAL_RESOLUTION_STATUSES.DENIED,
  APPROVAL_RESOLUTION_STATUSES.ABORTED,
  APPROVAL_RESOLUTION_STATUSES.EXPIRED,
]);

export type ApprovalResolutionStatus = z.infer<
  typeof ApprovalResolutionStatusSchema
>;

const ShellPersistentRuleSchema = z.object({
  category: z.literal("shell_command"),
  prefixTokens: z.array(z.string().min(1)).min(1),
  cwdScope: z.literal("current_repo"),
  networkAccess: z.enum(["none", "same_service_only"]),
});

const GitPersistentRuleSchema = z.object({
  category: z.literal("git_mutation"),
  allowedActions: z.array(z.enum(["stage", "commit"])).min(1),
  repoScope: z.literal("current_repo"),
});

const ProviderPersistentRuleSchema = z.object({
  category: z.literal("provider_connect"),
  providerId: z.string().min(1),
  allowedOperations: z.array(z.enum(["validate", "connect"])).min(1),
});

export const ProposedPersistentRuleSchema = z.union([
  ShellPersistentRuleSchema,
  GitPersistentRuleSchema,
  ProviderPersistentRuleSchema,
]);

export type ProposedPersistentRule =
  | {
      category: "shell_command";
      prefixTokens: string[];
      cwdScope: "current_repo";
      networkAccess: "none" | "same_service_only";
    }
  | {
      category: "git_mutation";
      allowedActions: Array<"stage" | "commit">;
      repoScope: "current_repo";
    }
  | {
      category: "provider_connect";
      providerId: string;
      allowedOperations: Array<"validate" | "connect">;
    };

export interface ApprovalRequest {
  requestId: string;
  runId: string;
  threadId?: string;
  sessionId?: string;
  turnId?: string;
  itemId?: string;
  origin: "user" | "agent";
  category: RiskyActionCategory;
  title: string;
  reason: string;
  command?: string;
  cwd?: string;
  affectedPaths?: string[];
  remoteTarget?: string;
  actionFingerprint: string;
  availableDecisions: ApprovalDecisionKind[];
  proposedPersistentRule?: ProposedPersistentRule;
  createdAt: string;
  expiresAt?: string;
}

export const ApprovalRequestSchema: z.ZodType<ApprovalRequest> = z.object({
  requestId: z.string().min(1),
  runId: z.string().min(1),
  threadId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  turnId: z.string().min(1).optional(),
  itemId: z.string().min(1).optional(),
  origin: z.enum(["user", "agent"]),
  category: RiskyActionCategorySchema,
  title: z.string().min(1),
  reason: z.string().min(1),
  command: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  affectedPaths: z.array(z.string().min(1)).optional(),
  remoteTarget: z.string().min(1).optional(),
  actionFingerprint: z.string().min(1),
  availableDecisions: z.array(ApprovalDecisionKindSchema).min(1),
  proposedPersistentRule: ProposedPersistentRuleSchema.optional(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
});

export type ApprovalDecision =
  | { kind: "allow_once"; requestId: string }
  | { kind: "allow_for_run"; requestId: string }
  | { kind: "allow_persistent_rule"; requestId: string }
  | { kind: "deny"; requestId: string }
  | { kind: "abort"; requestId: string };

export type PermissionEvaluationResult =
  | { kind: "allow" }
  | { kind: "deny"; reason: string }
  | { kind: "ask"; request: ApprovalRequest };
