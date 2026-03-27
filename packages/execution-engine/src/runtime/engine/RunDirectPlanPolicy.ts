import {
  isConcreteCommandInput,
  isConcretePathInput,
} from "../contracts/index.js";
import type { TaskType } from "../types.js";

const DIRECT_READ_PATTERN =
  /^(?:please\s+)?(?:read|open|show|cat|print|inspect)\s+(.+)$/i;
const DIRECT_LIST_PATTERN =
  /^(?:please\s+)?(?:list|ls|show)\s+(?:files|directories|folders)(?:\s+in\s+(.+))?$/i;
const DIRECT_GIT_STATUS_PATTERN =
  /^(?:please\s+)?(?:git\s+status|show\s+git\s+status|check\s+git\s+status|show\s+repo\s+status)$/i;
const DIRECT_GIT_DIFF_PATTERN =
  /^(?:please\s+)?(?:git\s+diff(?:\s+(.+))?|show\s+git\s+diff(?:\s+for\s+(.+))?)$/i;
const DIRECT_RUN_PATTERN = /^(?:please\s+)?(?:run|execute)\s+(.+)$/i;
const DIRECT_RAW_COMMAND_PATTERN =
  /^(?:pnpm|npm|yarn|bun|node|python|python3|pytest|make)\b/i;
const DIRECT_WRITE_QUOTED_PATTERN =
  /^(?:please\s+)?(?:write|overwrite|create)\s+(?:file\s+)?([^\s:]+)\s+with(?:\s+content)?\s+["']([\s\S]+)["']$/i;
const DIRECT_WRITE_CODE_BLOCK_PATH_FIRST_PATTERN =
  /^(?:please\s+)?(?:write|overwrite|create)\s+(?:file\s+)?([^\s:]+)[\s:]+```[a-z0-9_-]*\n([\s\S]*?)```$/i;
const DIRECT_WRITE_CODE_BLOCK_TO_PATH_PATTERN =
  /^(?:please\s+)?(?:write|overwrite)\s+```[a-z0-9_-]*\n([\s\S]*?)```\s+to\s+([^\s:]+)$/i;
const SUMMARY_TAIL_PATTERN =
  /\s+(?:and|then)\s+(?:summarize|explain|review|describe)(?:\b.*)?$/i;

export interface ExecutablePlannedTask {
  id: string;
  type: TaskType;
  description: string;
  dependsOn: string[];
  expectedOutput?: string;
  input?: Record<string, unknown>;
}

export interface ExecutablePlan {
  tasks: ExecutablePlannedTask[];
  metadata: {
    estimatedSteps: number;
    reasoning?: string;
  };
}

export function buildDirectExecutionPlan(
  prompt: string,
): ExecutablePlan | null {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    return null;
  }

  return (
    buildReadFilePlan(normalizedPrompt) ??
    buildWriteFilePlan(normalizedPrompt) ??
    buildListFilesPlan(normalizedPrompt) ??
    buildGitStatusPlan(normalizedPrompt) ??
    buildGitDiffPlan(normalizedPrompt) ??
    buildRunCommandPlan(normalizedPrompt)
  );
}

function buildReadFilePlan(prompt: string): ExecutablePlan | null {
  const match = prompt.match(DIRECT_READ_PATTERN);
  const target = stripSummaryTail(match?.[1]);
  if (!target || !isConcretePathInput(target)) {
    return null;
  }
  return createDirectPlan({
    type: "read_file",
    description: `Read ${target}`,
    expectedOutput: `Contents of ${target}`,
    input: { path: target },
    reasoning: "Direct read request resolved without planner decomposition.",
  });
}

function buildWriteFilePlan(prompt: string): ExecutablePlan | null {
  const codeBlockPathFirst = prompt.match(
    DIRECT_WRITE_CODE_BLOCK_PATH_FIRST_PATTERN,
  );
  if (codeBlockPathFirst) {
    return createWriteFilePlan(
      codeBlockPathFirst[1],
      trimTrailingNewline(codeBlockPathFirst[2]),
      "Direct file write request provided explicit replacement content.",
    );
  }

  const codeBlockToPath = prompt.match(DIRECT_WRITE_CODE_BLOCK_TO_PATH_PATTERN);
  if (codeBlockToPath) {
    return createWriteFilePlan(
      codeBlockToPath[2],
      trimTrailingNewline(codeBlockToPath[1]),
      "Direct file write request provided explicit replacement content.",
    );
  }

  const quotedWrite = prompt.match(DIRECT_WRITE_QUOTED_PATTERN);
  if (!quotedWrite) {
    return null;
  }

  return createWriteFilePlan(
    quotedWrite[1],
    quotedWrite[2],
    "Direct file write request provided explicit quoted content.",
  );
}

function buildListFilesPlan(prompt: string): ExecutablePlan | null {
  const match = prompt.match(DIRECT_LIST_PATTERN);
  if (!match) {
    return null;
  }
  const path = match[1]?.trim();
  if (path && !isConcretePathInput(path)) {
    return null;
  }
  const targetPath = path && path.length > 0 ? path : ".";
  return createDirectPlan({
    type: "list_files",
    description: `List files in ${targetPath}`,
    expectedOutput: `Directory listing for ${targetPath}`,
    input: targetPath === "." ? {} : { path: targetPath },
    reasoning:
      "Direct directory listing request resolved without planner decomposition.",
  });
}

function buildGitStatusPlan(prompt: string): ExecutablePlan | null {
  if (!DIRECT_GIT_STATUS_PATTERN.test(prompt)) {
    return null;
  }
  return createDirectPlan({
    type: "git_status",
    description: "Inspect repository status",
    expectedOutput: "Current git status",
    input: {},
    reasoning:
      "Direct git status request resolved without planner decomposition.",
  });
}

function buildGitDiffPlan(prompt: string): ExecutablePlan | null {
  const match = prompt.match(DIRECT_GIT_DIFF_PATTERN);
  if (!match) {
    return null;
  }
  const pathCandidate = match[1] ?? match[2];
  if (pathCandidate && !isConcretePathInput(pathCandidate)) {
    return null;
  }
  return createDirectPlan({
    type: "git_diff",
    description: pathCandidate
      ? `Inspect git diff for ${pathCandidate}`
      : "Inspect repository diff",
    expectedOutput: "Current git diff",
    input: pathCandidate ? { path: pathCandidate } : {},
    reasoning:
      "Direct git diff request resolved without planner decomposition.",
  });
}

function buildRunCommandPlan(prompt: string): ExecutablePlan | null {
  const explicitCommand = prompt.match(DIRECT_RUN_PATTERN)?.[1]?.trim();
  if (explicitCommand && isConcreteCommandInput(explicitCommand)) {
    return createRunCommandPlan(
      explicitCommand,
      "Direct run request resolved without planner decomposition.",
    );
  }

  if (!DIRECT_RAW_COMMAND_PATTERN.test(prompt)) {
    return null;
  }
  if (!isConcreteCommandInput(prompt)) {
    return null;
  }

  return createRunCommandPlan(
    prompt,
    "Concrete shell command resolved without planner decomposition.",
  );
}

function createWriteFilePlan(
  path: string | undefined,
  content: string | undefined,
  reasoning: string,
): ExecutablePlan | null {
  if (!path || !content || !isConcretePathInput(path)) {
    return null;
  }
  return createDirectPlan({
    type: "write_file",
    description: `Write ${path}`,
    expectedOutput: `Updated contents for ${path}`,
    input: { path, content },
    reasoning,
  });
}

function createRunCommandPlan(
  command: string,
  reasoning: string,
): ExecutablePlan {
  return createDirectPlan({
    type: "bash",
    description: `Run ${command}`,
    expectedOutput: `Command output for ${command}`,
    input: { command },
    reasoning,
  });
}

function createDirectPlan(input: {
  type: TaskType;
  description: string;
  expectedOutput: string;
  input: Record<string, unknown>;
  reasoning: string;
}): ExecutablePlan {
  return {
    tasks: [
      {
        id: "1",
        type: input.type,
        description: input.description,
        dependsOn: [],
        expectedOutput: input.expectedOutput,
        input: input.input,
      },
    ],
    metadata: {
      estimatedSteps: 1,
      reasoning: input.reasoning,
    },
  };
}

function stripSummaryTail(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().replace(SUMMARY_TAIL_PATTERN, "").trim();
  return normalized.length > 0 ? normalized : null;
}

function trimTrailingNewline(value: string | undefined): string | undefined {
  return value?.replace(/\n$/, "");
}
