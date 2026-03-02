import type { TaskType } from "../types.js";

export const VALID_GIT_ACTIONS = [
  "status",
  "diff",
  "stage",
  "unstage",
  "commit",
  "push",
  "git_clone",
  "git_diff",
  "git_commit",
  "git_push",
  "git_pull",
  "git_fetch",
  "git_branch_create",
  "git_branch_switch",
  "git_branch_list",
  "git_stage",
  "git_status",
  "git_config",
] as const;

const VAGUE_INPUT_PATTERNS = [
  /^(analyze|analyze the|check|check if|look at|examine|read the)/i,
  /^(if |when |make |ensure |install )/i,
  /^(find |search |locate |discover )/i,
];

export function isVagueTaskInput(value: string): boolean {
  return VAGUE_INPUT_PATTERNS.some((pattern) => pattern.test(value.trim()));
}

export function isConcretePathInput(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    normalized.length < 500 &&
    !isVagueTaskInput(normalized)
  );
}

export function isConcreteCommandInput(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    normalized.length < 500 &&
    !isVagueTaskInput(normalized)
  );
}

export function isValidGitActionInput(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  return VALID_GIT_ACTIONS.includes(
    value as (typeof VALID_GIT_ACTIONS)[number],
  );
}

export function hasValidTaskInput(
  taskType: TaskType | string,
  input: Record<string, unknown> | undefined,
): boolean {
  if (taskType === "review") {
    return true;
  }

  if (!input || typeof input !== "object") {
    return false;
  }

  if (taskType === "analyze") {
    return isConcretePathInput(input.path);
  }

  if (taskType === "edit") {
    return (
      isConcretePathInput(input.path) &&
      typeof input.content === "string" &&
      input.content.length > 0
    );
  }

  if (taskType === "test" || taskType === "shell") {
    return isConcreteCommandInput(input.command);
  }

  if (taskType === "git") {
    return isValidGitActionInput(input.action);
  }

  return false;
}
