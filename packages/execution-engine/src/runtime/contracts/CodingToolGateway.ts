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

const GOLDEN_FLOW_TOOL_SPECS: Record<GoldenFlowToolName, GoldenFlowToolSpec> = {
  read_file: {
    description: "Read a file from the current workspace.",
    parameters: z.object({
      path: z.string().min(1).max(MAX_PATH_LENGTH),
    }),
    route: { toolName: "read_file", plugin: "filesystem", action: "read_file" },
  },
  list_files: {
    description: "List files in a workspace directory.",
    parameters: z.object({
      path: z.string().min(1).max(MAX_PATH_LENGTH).optional(),
    }),
    route: { toolName: "list_files", plugin: "filesystem", action: "list_files" },
  },
  write_file: {
    description: "Write content to a file path in the workspace.",
    parameters: z.object({
      path: z.string().min(1).max(MAX_PATH_LENGTH),
      content: z.string().min(1).max(MAX_WRITE_CONTENT_LENGTH),
    }),
    route: { toolName: "write_file", plugin: "filesystem", action: "write_file" },
  },
  run_command: {
    description: "Run a bounded Node/shell command in the workspace.",
    parameters: z.object({
      command: z.string().min(1).max(MAX_COMMAND_LENGTH),
    }),
    route: { toolName: "run_command", plugin: "node", action: "run" },
  },
  git_status: {
    description: "Get git status for the workspace repository.",
    parameters: z.object({}),
    route: { toolName: "git_status", plugin: "git", action: "git_status" },
  },
  git_diff: {
    description: "Get git diff for workspace changes.",
    parameters: z.object({
      path: z.string().min(1).max(MAX_PATH_LENGTH).optional(),
      staged: z.boolean().optional(),
    }),
    route: { toolName: "git_diff", plugin: "git", action: "git_diff" },
  },
  glob: {
    description: "Find files by glob pattern.",
    parameters: z.object({
      pattern: z.string().min(1).max(MAX_PATTERN_LENGTH),
      path: z.string().min(1).max(MAX_PATH_LENGTH).optional(),
      maxResults: z.number().int().min(1).max(MAX_SEARCH_RESULTS).optional(),
    }),
    route: { toolName: "glob", plugin: "internal", action: "glob" },
  },
  grep: {
    description: "Search file content by pattern.",
    parameters: z.object({
      pattern: z.string().min(1).max(MAX_PATTERN_LENGTH),
      path: z.string().min(1).max(MAX_PATH_LENGTH).optional(),
      glob: z.string().min(1).max(MAX_PATTERN_LENGTH).optional(),
      maxResults: z.number().int().min(1).max(MAX_SEARCH_RESULTS).optional(),
      caseSensitive: z.boolean().optional(),
    }),
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

export function isGoldenFlowToolName(value: string): value is GoldenFlowToolName {
  return GOLDEN_FLOW_TOOL_NAMES.includes(value as GoldenFlowToolName);
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
