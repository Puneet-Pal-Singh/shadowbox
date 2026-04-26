import type { CoreTool } from "ai";
import { z } from "zod";

const MAX_PATH_LENGTH = 500;
const MAX_COMMAND_LENGTH = 500;
const MAX_PATTERN_LENGTH = 200;
const MAX_WRITE_CONTENT_LENGTH = 200_000;
const MAX_SEARCH_RESULTS = 200;

export type GoldenFlowToolName =
  | "read_file"
  | "list_files"
  | "write_file"
  | "bash"
  | "git_stage"
  | "git_commit"
  | "git_push"
  | "git_pull"
  | "git_create_pull_request"
  | "git_branch_create"
  | "git_branch_switch"
  | "git_status"
  | "git_diff"
  | "github_pr_list"
  | "github_pr_get"
  | "github_pr_checks_get"
  | "github_review_threads_get"
  | "github_issue_get"
  | "github_actions_run_get"
  | "github_actions_job_logs_get"
  | "github_cli_pr_checks_get"
  | "github_cli_actions_run_get"
  | "github_cli_actions_job_logs_get"
  | "github_cli_pr_comment"
  | "glob"
  | "grep";

export interface ToolGatewayRoute {
  toolName: GoldenFlowToolName;
  plugin:
    | "filesystem"
    | "node"
    | "git"
    | "github"
    | "github_cli"
    | "bash"
    | "internal";
  action: string;
}

interface GoldenFlowToolSpec {
  description: string;
  parameters: z.ZodTypeAny;
  route: ToolGatewayRoute;
}

function createToolInputSchema<TShape extends z.ZodRawShape>(
  shape: TShape,
  options: { allowNullishEmptyObject?: boolean } = {},
) {
  const baseSchema = z.object(shape);
  if (!options.allowNullishEmptyObject) {
    return baseSchema;
  }

  return z.preprocess(
    (value) => (value == null ? {} : value),
    baseSchema,
  );
}

const READ_FILE_TOOL_INPUT_SCHEMA = createToolInputSchema({
  path: z.string().min(1).max(MAX_PATH_LENGTH),
});

const LIST_FILES_TOOL_INPUT_SCHEMA = createToolInputSchema(
  {
    path: z.string().max(MAX_PATH_LENGTH).optional(),
  },
  { allowNullishEmptyObject: true },
);

const WRITE_FILE_TOOL_INPUT_SCHEMA = createToolInputSchema({
  path: z.string().min(1).max(MAX_PATH_LENGTH),
  content: z.string().min(1).max(MAX_WRITE_CONTENT_LENGTH),
});

const BASH_TOOL_INPUT_SCHEMA = createToolInputSchema({
  command: z.string().min(1).max(MAX_COMMAND_LENGTH),
  cwd: z.string().min(1).max(MAX_PATH_LENGTH).optional(),
  description: z.string().min(1).max(MAX_COMMAND_LENGTH).optional(),
});

const GIT_STAGE_TOOL_INPUT_SCHEMA = createToolInputSchema(
  {
    files: z.array(z.string().min(1).max(MAX_PATH_LENGTH)).optional(),
  },
  { allowNullishEmptyObject: true },
);

const GIT_COMMIT_TOOL_INPUT_SCHEMA = createToolInputSchema({
  message: z
    .string()
    .min(1)
    .max(MAX_COMMAND_LENGTH)
    .refine((value) => !/[\r\n\0]/.test(value), {
      message: "Commit message must be a single-line subject",
    }),
  files: z.array(z.string().min(1).max(MAX_PATH_LENGTH)).optional(),
  authorName: z.string().min(1).max(MAX_COMMAND_LENGTH).optional(),
  authorEmail: z.string().min(1).max(MAX_COMMAND_LENGTH).optional(),
});

const GIT_PUSH_TOOL_INPUT_SCHEMA = createToolInputSchema(
  {
    remote: z.string().min(1).max(MAX_PATH_LENGTH).optional(),
    branch: z.string().min(1).max(MAX_PATH_LENGTH).optional(),
  },
  { allowNullishEmptyObject: true },
);

const GIT_PULL_TOOL_INPUT_SCHEMA = createToolInputSchema(
  {
    remote: z.string().min(1).max(MAX_PATH_LENGTH).optional(),
    branch: z.string().min(1).max(MAX_PATH_LENGTH).optional(),
  },
  { allowNullishEmptyObject: true },
);

const GIT_CREATE_PULL_REQUEST_TOOL_INPUT_SCHEMA = createToolInputSchema({
  owner: z.string().min(1).max(MAX_PATH_LENGTH),
  repo: z.string().min(1).max(MAX_PATH_LENGTH),
  title: z.string().min(1).max(MAX_COMMAND_LENGTH),
  body: z.string().max(MAX_WRITE_CONTENT_LENGTH).optional(),
  base: z.string().min(1).max(MAX_PATH_LENGTH).optional(),
});

const GIT_BRANCH_CREATE_TOOL_INPUT_SCHEMA = createToolInputSchema({
  branch: z.string().min(1).max(MAX_PATH_LENGTH),
});

const GIT_BRANCH_SWITCH_TOOL_INPUT_SCHEMA = createToolInputSchema({
  branch: z.string().min(1).max(MAX_PATH_LENGTH),
});

const GIT_STATUS_TOOL_INPUT_SCHEMA = createToolInputSchema(
  {},
  { allowNullishEmptyObject: true },
);

const GIT_DIFF_TOOL_INPUT_SCHEMA = createToolInputSchema(
  {
    path: z.string().min(1).max(MAX_PATH_LENGTH).optional(),
    staged: z.boolean().optional(),
  },
  { allowNullishEmptyObject: true },
);

const GITHUB_PR_GET_TOOL_INPUT_SCHEMA = createToolInputSchema({
  owner: z.string().min(1).max(MAX_PATH_LENGTH),
  repo: z.string().min(1).max(MAX_PATH_LENGTH),
  number: z.number().int().positive(),
});

const GITHUB_PR_LIST_TOOL_INPUT_SCHEMA = createToolInputSchema({
  owner: z.string().min(1).max(MAX_PATH_LENGTH),
  repo: z.string().min(1).max(MAX_PATH_LENGTH),
  state: z.enum(["open", "closed", "all"]).optional(),
  head: z.string().min(1).max(MAX_PATH_LENGTH).optional(),
});

const GITHUB_PR_CHECKS_GET_TOOL_INPUT_SCHEMA = createToolInputSchema({
  owner: z.string().min(1).max(MAX_PATH_LENGTH),
  repo: z.string().min(1).max(MAX_PATH_LENGTH),
  number: z.number().int().positive(),
});

const GITHUB_REVIEW_THREADS_GET_TOOL_INPUT_SCHEMA = createToolInputSchema({
  owner: z.string().min(1).max(MAX_PATH_LENGTH),
  repo: z.string().min(1).max(MAX_PATH_LENGTH),
  number: z.number().int().positive(),
});

const GITHUB_ISSUE_GET_TOOL_INPUT_SCHEMA = createToolInputSchema({
  owner: z.string().min(1).max(MAX_PATH_LENGTH),
  repo: z.string().min(1).max(MAX_PATH_LENGTH),
  number: z.number().int().positive(),
});

const GITHUB_ACTIONS_RUN_GET_TOOL_INPUT_SCHEMA = createToolInputSchema({
  owner: z.string().min(1).max(MAX_PATH_LENGTH),
  repo: z.string().min(1).max(MAX_PATH_LENGTH),
  actionsRunId: z.number().int().positive(),
});

const GITHUB_ACTIONS_JOB_LOGS_GET_TOOL_INPUT_SCHEMA = createToolInputSchema({
  owner: z.string().min(1).max(MAX_PATH_LENGTH),
  repo: z.string().min(1).max(MAX_PATH_LENGTH),
  actionsJobId: z.number().int().positive(),
  tailLines: z.number().int().min(1).max(2_000).optional(),
});

const GITHUB_CLI_PR_CHECKS_GET_TOOL_INPUT_SCHEMA = createToolInputSchema({
  owner: z.string().min(1).max(MAX_PATH_LENGTH),
  repo: z.string().min(1).max(MAX_PATH_LENGTH),
  number: z.number().int().positive(),
});

const GITHUB_CLI_ACTIONS_RUN_GET_TOOL_INPUT_SCHEMA = createToolInputSchema({
  owner: z.string().min(1).max(MAX_PATH_LENGTH),
  repo: z.string().min(1).max(MAX_PATH_LENGTH),
  actionsRunId: z.number().int().positive(),
});

const GITHUB_CLI_ACTIONS_JOB_LOGS_GET_TOOL_INPUT_SCHEMA = createToolInputSchema(
  {
    owner: z.string().min(1).max(MAX_PATH_LENGTH),
    repo: z.string().min(1).max(MAX_PATH_LENGTH),
    actionsJobId: z.number().int().positive(),
    tailLines: z.number().int().min(1).max(2_000).optional(),
  },
);

const GITHUB_CLI_PR_COMMENT_TOOL_INPUT_SCHEMA = createToolInputSchema({
  owner: z.string().min(1).max(MAX_PATH_LENGTH),
  repo: z.string().min(1).max(MAX_PATH_LENGTH),
  number: z.number().int().positive(),
  body: z.string().min(1).max(MAX_WRITE_CONTENT_LENGTH),
});

const GLOB_TOOL_INPUT_SCHEMA = createToolInputSchema({
  pattern: z.string().min(1).max(MAX_PATTERN_LENGTH),
  path: z.string().min(1).max(MAX_PATH_LENGTH).optional(),
  maxResults: z.number().int().min(1).max(MAX_SEARCH_RESULTS).optional(),
});

const GREP_TOOL_INPUT_SCHEMA = createToolInputSchema({
  pattern: z.string().min(1).max(MAX_PATTERN_LENGTH),
  path: z.string().min(1).max(MAX_PATH_LENGTH).optional(),
  glob: z.string().min(1).max(MAX_PATTERN_LENGTH).optional(),
  maxResults: z.number().int().min(1).max(MAX_SEARCH_RESULTS).optional(),
  caseSensitive: z.boolean().optional(),
});

export type GoldenFlowToolInputByName = {
  read_file: z.infer<typeof READ_FILE_TOOL_INPUT_SCHEMA>;
  list_files: z.infer<typeof LIST_FILES_TOOL_INPUT_SCHEMA>;
  write_file: z.infer<typeof WRITE_FILE_TOOL_INPUT_SCHEMA>;
  bash: z.infer<typeof BASH_TOOL_INPUT_SCHEMA>;
  git_stage: z.infer<typeof GIT_STAGE_TOOL_INPUT_SCHEMA>;
  git_commit: z.infer<typeof GIT_COMMIT_TOOL_INPUT_SCHEMA>;
  git_push: z.infer<typeof GIT_PUSH_TOOL_INPUT_SCHEMA>;
  git_pull: z.infer<typeof GIT_PULL_TOOL_INPUT_SCHEMA>;
  git_create_pull_request: z.infer<
    typeof GIT_CREATE_PULL_REQUEST_TOOL_INPUT_SCHEMA
  >;
  git_branch_create: z.infer<typeof GIT_BRANCH_CREATE_TOOL_INPUT_SCHEMA>;
  git_branch_switch: z.infer<typeof GIT_BRANCH_SWITCH_TOOL_INPUT_SCHEMA>;
  git_status: z.infer<typeof GIT_STATUS_TOOL_INPUT_SCHEMA>;
  git_diff: z.infer<typeof GIT_DIFF_TOOL_INPUT_SCHEMA>;
  github_pr_list: z.infer<typeof GITHUB_PR_LIST_TOOL_INPUT_SCHEMA>;
  github_pr_get: z.infer<typeof GITHUB_PR_GET_TOOL_INPUT_SCHEMA>;
  github_pr_checks_get: z.infer<typeof GITHUB_PR_CHECKS_GET_TOOL_INPUT_SCHEMA>;
  github_review_threads_get: z.infer<
    typeof GITHUB_REVIEW_THREADS_GET_TOOL_INPUT_SCHEMA
  >;
  github_issue_get: z.infer<typeof GITHUB_ISSUE_GET_TOOL_INPUT_SCHEMA>;
  github_actions_run_get: z.infer<typeof GITHUB_ACTIONS_RUN_GET_TOOL_INPUT_SCHEMA>;
  github_actions_job_logs_get: z.infer<
    typeof GITHUB_ACTIONS_JOB_LOGS_GET_TOOL_INPUT_SCHEMA
  >;
  github_cli_pr_checks_get: z.infer<
    typeof GITHUB_CLI_PR_CHECKS_GET_TOOL_INPUT_SCHEMA
  >;
  github_cli_actions_run_get: z.infer<
    typeof GITHUB_CLI_ACTIONS_RUN_GET_TOOL_INPUT_SCHEMA
  >;
  github_cli_actions_job_logs_get: z.infer<
    typeof GITHUB_CLI_ACTIONS_JOB_LOGS_GET_TOOL_INPUT_SCHEMA
  >;
  github_cli_pr_comment: z.infer<typeof GITHUB_CLI_PR_COMMENT_TOOL_INPUT_SCHEMA>;
  glob: z.infer<typeof GLOB_TOOL_INPUT_SCHEMA>;
  grep: z.infer<typeof GREP_TOOL_INPUT_SCHEMA>;
};

const GOLDEN_FLOW_TOOL_SPECS: Record<GoldenFlowToolName, GoldenFlowToolSpec> = {
  read_file: {
    description: "Read a file from the current workspace.",
    parameters: READ_FILE_TOOL_INPUT_SCHEMA,
    route: { toolName: "read_file", plugin: "filesystem", action: "read_file" },
  },
  list_files: {
    description: "List files in a workspace directory.",
    parameters: LIST_FILES_TOOL_INPUT_SCHEMA,
    route: {
      toolName: "list_files",
      plugin: "filesystem",
      action: "list_files",
    },
  },
  write_file: {
    description: "Write content to a file path in the workspace.",
    parameters: WRITE_FILE_TOOL_INPUT_SCHEMA,
    route: {
      toolName: "write_file",
      plugin: "filesystem",
      action: "write_file",
    },
  },
  bash: {
    description: "Run a bounded bash command in the current workspace.",
    parameters: BASH_TOOL_INPUT_SCHEMA,
    route: { toolName: "bash", plugin: "bash", action: "run" },
  },
  git_stage: {
    description: "Stage workspace files with the dedicated git tool.",
    parameters: GIT_STAGE_TOOL_INPUT_SCHEMA,
    route: { toolName: "git_stage", plugin: "git", action: "git_stage" },
  },
  git_commit: {
    description:
      "Create a git commit with a single-line conventional commit subject.",
    parameters: GIT_COMMIT_TOOL_INPUT_SCHEMA,
    route: { toolName: "git_commit", plugin: "git", action: "git_commit" },
  },
  git_push: {
    description: "Push workspace commits with the dedicated git tool.",
    parameters: GIT_PUSH_TOOL_INPUT_SCHEMA,
    route: { toolName: "git_push", plugin: "git", action: "git_push" },
  },
  git_pull: {
    description:
      "Sync the current branch from the remote with a fast-forward-only pull.",
    parameters: GIT_PULL_TOOL_INPUT_SCHEMA,
    route: { toolName: "git_pull", plugin: "git", action: "git_pull" },
  },
  git_create_pull_request: {
    description:
      "Create a pull request from the current run workspace using the dedicated GitHub-backed tool.",
    parameters: GIT_CREATE_PULL_REQUEST_TOOL_INPUT_SCHEMA,
    route: {
      toolName: "git_create_pull_request",
      plugin: "git",
      action: "git_create_pull_request",
    },
  },
  git_branch_create: {
    description: "Create and switch to a new git branch.",
    parameters: GIT_BRANCH_CREATE_TOOL_INPUT_SCHEMA,
    route: {
      toolName: "git_branch_create",
      plugin: "git",
      action: "git_branch_create",
    },
  },
  git_branch_switch: {
    description: "Switch to an existing git branch.",
    parameters: GIT_BRANCH_SWITCH_TOOL_INPUT_SCHEMA,
    route: {
      toolName: "git_branch_switch",
      plugin: "git",
      action: "git_branch_switch",
    },
  },
  git_status: {
    description: "Get git status for the workspace repository.",
    parameters: GIT_STATUS_TOOL_INPUT_SCHEMA,
    route: { toolName: "git_status", plugin: "git", action: "git_status" },
  },
  git_diff: {
    description: "Get git diff for workspace changes.",
    parameters: GIT_DIFF_TOOL_INPUT_SCHEMA,
    route: { toolName: "git_diff", plugin: "git", action: "git_diff" },
  },
  github_pr_list: {
    description:
      "List remote GitHub pull requests, optionally filtered by state and head branch.",
    parameters: GITHUB_PR_LIST_TOOL_INPUT_SCHEMA,
    route: {
      toolName: "github_pr_list",
      plugin: "github",
      action: "pr_list",
    },
  },
  github_pr_get: {
    description: "Get remote GitHub pull request metadata.",
    parameters: GITHUB_PR_GET_TOOL_INPUT_SCHEMA,
    route: {
      toolName: "github_pr_get",
      plugin: "github",
      action: "pr_get",
    },
  },
  github_pr_checks_get: {
    description: "Get GitHub check runs for a pull request head commit.",
    parameters: GITHUB_PR_CHECKS_GET_TOOL_INPUT_SCHEMA,
    route: {
      toolName: "github_pr_checks_get",
      plugin: "github",
      action: "pr_checks_get",
    },
  },
  github_review_threads_get: {
    description: "Get pull request review thread metadata from GitHub.",
    parameters: GITHUB_REVIEW_THREADS_GET_TOOL_INPUT_SCHEMA,
    route: {
      toolName: "github_review_threads_get",
      plugin: "github",
      action: "review_threads_get",
    },
  },
  github_issue_get: {
    description: "Get remote GitHub issue metadata.",
    parameters: GITHUB_ISSUE_GET_TOOL_INPUT_SCHEMA,
    route: {
      toolName: "github_issue_get",
      plugin: "github",
      action: "issue_get",
    },
  },
  github_actions_run_get: {
    description: "Get a GitHub Actions workflow run summary.",
    parameters: GITHUB_ACTIONS_RUN_GET_TOOL_INPUT_SCHEMA,
    route: {
      toolName: "github_actions_run_get",
      plugin: "github",
      action: "actions_run_get",
    },
  },
  github_actions_job_logs_get: {
    description:
      "Get the latest log tail for a GitHub Actions workflow job.",
    parameters: GITHUB_ACTIONS_JOB_LOGS_GET_TOOL_INPUT_SCHEMA,
    route: {
      toolName: "github_actions_job_logs_get",
      plugin: "github",
      action: "actions_job_logs_get",
    },
  },
  github_cli_pr_checks_get: {
    description: "Get GitHub check runs through the bounded GitHub CLI lane.",
    parameters: GITHUB_CLI_PR_CHECKS_GET_TOOL_INPUT_SCHEMA,
    route: {
      toolName: "github_cli_pr_checks_get",
      plugin: "github_cli",
      action: "pr_checks_get",
    },
  },
  github_cli_actions_run_get: {
    description:
      "Get GitHub Actions workflow run metadata through the bounded GitHub CLI lane.",
    parameters: GITHUB_CLI_ACTIONS_RUN_GET_TOOL_INPUT_SCHEMA,
    route: {
      toolName: "github_cli_actions_run_get",
      plugin: "github_cli",
      action: "actions_run_get",
    },
  },
  github_cli_actions_job_logs_get: {
    description:
      "Get GitHub Actions workflow job logs through the bounded GitHub CLI lane.",
    parameters: GITHUB_CLI_ACTIONS_JOB_LOGS_GET_TOOL_INPUT_SCHEMA,
    route: {
      toolName: "github_cli_actions_job_logs_get",
      plugin: "github_cli",
      action: "actions_job_logs_get",
    },
  },
  github_cli_pr_comment: {
    description: "Create a pull request comment through the bounded GitHub CLI lane.",
    parameters: GITHUB_CLI_PR_COMMENT_TOOL_INPUT_SCHEMA,
    route: {
      toolName: "github_cli_pr_comment",
      plugin: "github_cli",
      action: "pr_comment",
    },
  },
  glob: {
    description: "Find files by glob pattern.",
    parameters: GLOB_TOOL_INPUT_SCHEMA,
    route: { toolName: "glob", plugin: "internal", action: "glob" },
  },
  grep: {
    description: "Search file content by pattern.",
    parameters: GREP_TOOL_INPUT_SCHEMA,
    route: { toolName: "grep", plugin: "internal", action: "grep" },
  },
};

const GOLDEN_FLOW_TOOL_NAMES = Object.keys(
  GOLDEN_FLOW_TOOL_SPECS,
) as GoldenFlowToolName[];

// TODO(75-tool-floor-deferred): keep deferred tools out of the canonical floor for phase A.
// Deferred: web_fetch, web_search, ask_user_question/request_user_input, notebook_edit, todo_write,
// enter_worktree/exit_worktree, task_output/task_stop, config, skill, agent, enterprise permission overlays.

export function getGoldenFlowToolNames(): GoldenFlowToolName[] {
  return [...GOLDEN_FLOW_TOOL_NAMES];
}

export function isGoldenFlowToolName(
  value: string,
): value is GoldenFlowToolName {
  return GOLDEN_FLOW_TOOL_NAMES.includes(value as GoldenFlowToolName);
}

export function isMutatingGoldenFlowToolName(toolName: string): boolean {
  return [
    "write_file",
    "bash",
    "git_stage",
    "git_commit",
    "git_push",
    "git_pull",
    "git_create_pull_request",
    "git_branch_create",
    "git_branch_switch",
    "github_cli_pr_comment",
  ].includes(toolName);
}

export function getGoldenFlowToolRoute(
  toolName: string,
): ToolGatewayRoute | null {
  if (!isGoldenFlowToolName(toolName)) {
    return null;
  }
  const route = GOLDEN_FLOW_TOOL_SPECS[toolName].route;
  return { ...route };
}

export function getGoldenFlowToolRegistry(): Record<string, CoreTool> {
  const registry: Record<string, CoreTool> = {};
  for (const toolName of GOLDEN_FLOW_TOOL_NAMES) {
    const spec = GOLDEN_FLOW_TOOL_SPECS[toolName];
    registry[toolName] = {
      description: spec.description,
      parameters: spec.parameters,
    } as CoreTool;
  }
  return registry;
}

export function enforceGoldenFlowToolFloor(
  incomingTools: Record<string, CoreTool>,
  metadata?: Record<string, unknown>,
): Record<string, CoreTool> {
  const defaults = getGoldenFlowToolRegistry();
  const constrained: Record<string, CoreTool> = {};
  const githubCliFlags = resolveGitHubCliFlags(metadata);
  for (const toolName of GOLDEN_FLOW_TOOL_NAMES) {
    if (!isGoldenFlowToolEnabledByFlags(toolName, githubCliFlags)) {
      continue;
    }
    const incoming = incomingTools[toolName];
    const fallback = defaults[toolName];
    if (!fallback) {
      continue;
    }
    constrained[toolName] = incoming ?? fallback;
  }
  return constrained;
}

export function validateGoldenFlowToolInput<T extends GoldenFlowToolName>(
  toolName: T,
  input: unknown,
): GoldenFlowToolInputByName[T] {
  const parsed = GOLDEN_FLOW_TOOL_SPECS[toolName].parameters.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid ${toolName} input. ${details}`);
  }
  return parsed.data as GoldenFlowToolInputByName[T];
}

interface GitHubCliLaneFlags {
  laneEnabled: boolean;
  ciEnabled: boolean;
  prCommentEnabled: boolean;
}

function resolveGitHubCliFlags(
  metadata: Record<string, unknown> | undefined,
): GitHubCliLaneFlags {
  const featureFlags =
    metadata?.featureFlags && typeof metadata.featureFlags === "object"
      ? (metadata.featureFlags as Record<string, unknown>)
      : undefined;

  const readBoolean = (value: unknown): boolean | undefined =>
    typeof value === "boolean" ? value : undefined;

  const laneEnabled = readBoolean(featureFlags?.ghCliLaneEnabled) ?? false;
  const ciEnabled = readBoolean(featureFlags?.ghCliCiEnabled) ?? false;
  const prCommentEnabled =
    readBoolean(featureFlags?.ghCliPrCommentEnabled) ?? false;
  return {
    laneEnabled,
    ciEnabled,
    prCommentEnabled,
  };
}

function isGoldenFlowToolEnabledByFlags(
  toolName: GoldenFlowToolName,
  flags: GitHubCliLaneFlags,
): boolean {
  if (toolName === "github_cli_pr_comment") {
    return flags.laneEnabled && flags.prCommentEnabled;
  }

  if (
    toolName === "github_cli_pr_checks_get" ||
    toolName === "github_cli_actions_run_get" ||
    toolName === "github_cli_actions_job_logs_get"
  ) {
    return flags.laneEnabled && flags.ciEnabled;
  }

  return true;
}
