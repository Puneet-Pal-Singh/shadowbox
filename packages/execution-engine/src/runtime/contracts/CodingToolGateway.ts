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
  | "run_command"
  | "git_status"
  | "git_diff"
  | "glob"
  | "grep";

export interface ToolGatewayRoute {
  toolName: GoldenFlowToolName;
  plugin: "filesystem" | "node" | "git" | "internal";
  action: string;
}

interface GoldenFlowToolSpec {
  description: string;
  parameters: z.ZodTypeAny;
  route: ToolGatewayRoute;
}

const READ_FILE_TOOL_INPUT_SCHEMA = z.object({
  path: z.string().min(1).max(MAX_PATH_LENGTH),
});

const LIST_FILES_TOOL_INPUT_SCHEMA = z.object({
  path: z.string().min(1).max(MAX_PATH_LENGTH).optional(),
});

const WRITE_FILE_TOOL_INPUT_SCHEMA = z.object({
  path: z.string().min(1).max(MAX_PATH_LENGTH),
  content: z.string().min(1).max(MAX_WRITE_CONTENT_LENGTH),
});

const RUN_COMMAND_TOOL_INPUT_SCHEMA = z.object({
  command: z.string().min(1).max(MAX_COMMAND_LENGTH),
});

const GIT_STATUS_TOOL_INPUT_SCHEMA = z.object({});

const GIT_DIFF_TOOL_INPUT_SCHEMA = z.object({
  path: z.string().min(1).max(MAX_PATH_LENGTH).optional(),
  staged: z.boolean().optional(),
});

const GLOB_TOOL_INPUT_SCHEMA = z.object({
  pattern: z.string().min(1).max(MAX_PATTERN_LENGTH),
  path: z.string().min(1).max(MAX_PATH_LENGTH).optional(),
  maxResults: z.number().int().min(1).max(MAX_SEARCH_RESULTS).optional(),
});

const GREP_TOOL_INPUT_SCHEMA = z.object({
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
  run_command: z.infer<typeof RUN_COMMAND_TOOL_INPUT_SCHEMA>;
  git_status: z.infer<typeof GIT_STATUS_TOOL_INPUT_SCHEMA>;
  git_diff: z.infer<typeof GIT_DIFF_TOOL_INPUT_SCHEMA>;
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
  run_command: {
    description: "Run a bounded Node/shell command in the workspace.",
    parameters: RUN_COMMAND_TOOL_INPUT_SCHEMA,
    route: { toolName: "run_command", plugin: "node", action: "run" },
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
  return toolName === "write_file" || toolName === "run_command";
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
): Record<string, CoreTool> {
  const constrained = getGoldenFlowToolRegistry();
  for (const toolName of GOLDEN_FLOW_TOOL_NAMES) {
    const incoming = incomingTools[toolName];
    if (incoming) {
      constrained[toolName] = incoming;
    }
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
