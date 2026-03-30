import {
  isGoldenFlowToolName,
  type GoldenFlowToolInputByName,
  type GoldenFlowToolName,
  validateGoldenFlowToolInput,
} from "../contracts/CodingToolGateway.js";

export interface ToolPresentation {
  description: string;
  displayText: string;
  summary: string;
}

type ToolPresentationToolName = GoldenFlowToolName | "search_code";

type ToolPresentationInputByName = GoldenFlowToolInputByName & {
  search_code: GoldenFlowToolInputByName["grep"];
};

type ToolPresenter<T extends ToolPresentationToolName> = (
  input: ToolPresentationInputByName[T],
) => ToolPresentation;

type ToolPresentationDispatcher = (input: unknown) => ToolPresentation;

export function getToolPresentation(
  toolName: string,
  input: Record<string, unknown> | undefined,
): ToolPresentation {
  const explicitDescription = readString(input?.description);
  const explicitDisplayText = readString(input?.displayText);

  const derived = deriveToolPresentation(toolName, input);
  return {
    description: explicitDescription ?? derived.description,
    displayText:
      explicitDisplayText ??
      explicitDescription ??
      derived.displayText ??
      derived.description,
    summary: derived.summary,
  };
}

function deriveToolPresentation(
  toolName: string,
  input: Record<string, unknown> | undefined,
): ToolPresentation {
  if (!isToolPresentationToolName(toolName)) {
    return presentDefaultTool(toolName);
  }

  const presenter = TOOL_PRESENTERS[toolName];
  if (presenter) {
    return presenter(input);
  }

  return presentDefaultTool(toolName);
}

const TOOL_PRESENTERS: Record<
  ToolPresentationToolName,
  ToolPresentationDispatcher
> = {
  read_file: (input) =>
    presentReadFile(validateToolPresentationInput("read_file", input)),
  list_files: (input) =>
    presentListFiles(validateToolPresentationInput("list_files", input)),
  glob: (input) => presentGlob(validateToolPresentationInput("glob", input)),
  grep: (input) =>
    presentGrepOrSearchCode(validateToolPresentationInput("grep", input)),
  search_code: (input) =>
    presentGrepOrSearchCode(validateToolPresentationInput("search_code", input)),
  write_file: (input) =>
    presentWriteFile(validateToolPresentationInput("write_file", input)),
  bash: (input) => presentBash(validateToolPresentationInput("bash", input)),
  git_status: (input) =>
    presentGitStatus(validateToolPresentationInput("git_status", input)),
  git_diff: (input) =>
    presentGitDiff(validateToolPresentationInput("git_diff", input)),
};

function presentReadFile(
  input: ToolPresentationInputByName["read_file"],
): ToolPresentation {
  const path = input.path;
  return {
    description: path ? `Read ${path}` : "Read file",
    displayText: path ? `Reading ${path}` : "Reading file",
    summary: path
      ? `Reading file contents from ${path}.`
      : "Reading file contents from the workspace.",
  };
}

function presentListFiles(
  input: ToolPresentationInputByName["list_files"],
): ToolPresentation {
  const path = input.path;
  const target = path && path !== "." ? path : "project files";
  return {
    description: path && path !== "." ? `List ${path}` : "List project files",
    displayText: `Listing ${target}`,
    summary:
      path && path !== "."
        ? `Listing files in ${path}.`
        : "Listing files in the current workspace.",
  };
}

function presentGlob(
  input: ToolPresentationInputByName["glob"],
): ToolPresentation {
  const pattern = input.pattern;
  return {
    description: pattern ? `Find ${pattern}` : "Find files",
    displayText: pattern ? `Finding ${pattern}` : "Finding files",
    summary: pattern
      ? `Finding files that match ${pattern}.`
      : "Finding matching files in the workspace.",
  };
}

function presentGrepOrSearchCode(
  input:
    | ToolPresentationInputByName["grep"]
    | ToolPresentationInputByName["search_code"],
): ToolPresentation {
  const pattern = input.pattern;
  const path = input.path;
  return {
    description: pattern ? `Search for ${pattern}` : "Search project",
    displayText: pattern ? `Searching for ${pattern}` : "Searching project",
    summary:
      pattern && path && path !== "."
        ? `Searching ${path} for ${pattern}.`
        : pattern
          ? `Searching the workspace for ${pattern}.`
          : "Searching the workspace for matching content.",
  };
}

function presentWriteFile(
  input: ToolPresentationInputByName["write_file"],
): ToolPresentation {
  const path = input.path;
  return {
    description: path ? `Edit ${path}` : "Edit file",
    displayText: path ? `Editing ${path}` : "Editing file",
    summary: path
      ? `Applying a workspace edit to ${path}.`
      : "Applying a workspace edit.",
  };
}

function presentBash(input: ToolPresentationInputByName["bash"]): ToolPresentation {
  const command = input.command;
  return {
    description: command ? `Run ${command}` : "Run command",
    displayText: command ? `Running ${command}` : "Running command",
    summary: command
      ? `Running ${command} in the workspace.`
      : "Running a shell command in the workspace.",
  };
}

function presentGitStatus(
  _input: ToolPresentationInputByName["git_status"],
): ToolPresentation {
  return {
    description: "Check git status",
    displayText: "Checking git status",
    summary: "Checking the current repository status.",
  };
}

function presentGitDiff(
  input: ToolPresentationInputByName["git_diff"],
): ToolPresentation {
  const path = input.path;
  return {
    description: path ? `Check git diff for ${path}` : "Check git diff",
    displayText: path ? `Checking git diff for ${path}` : "Checking git diff",
    summary: path
      ? `Checking repository changes for ${path}.`
      : "Checking repository changes in the workspace.",
  };
}

function presentDefaultTool(toolName: string): ToolPresentation {
  const label = humanizeToolName(toolName);
  return {
    description: label,
    displayText: label,
    summary: `${label} in progress.`,
  };
}

function humanizeToolName(toolName: string): string {
  return toolName
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isToolPresentationToolName(
  toolName: string,
): toolName is ToolPresentationToolName {
  return toolName === "search_code" || isGoldenFlowToolName(toolName);
}

function validateToolPresentationInput<T extends ToolPresentationToolName>(
  toolName: T,
  input: unknown,
): ToolPresentationInputByName[T] {
  try {
    if (toolName === "search_code") {
      return validateGoldenFlowToolInput("grep", input) as ToolPresentationInputByName[T];
    }

    return validateGoldenFlowToolInput(toolName, input) as ToolPresentationInputByName[T];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown validation error";
    throw new Error(`[tool-presentation/${toolName}] ${message}`);
  }
}
