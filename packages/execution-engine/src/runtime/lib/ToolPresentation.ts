export interface ToolPresentation {
  description: string;
  displayText: string;
  summary: string;
}

type ToolPresenter = (
  input: Record<string, unknown> | undefined,
) => ToolPresentation;

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
      explicitDisplayText ?? derived.displayText ?? explicitDescription ?? derived.description,
    summary: derived.summary,
  };
}

function deriveToolPresentation(
  toolName: string,
  input: Record<string, unknown> | undefined,
): ToolPresentation {
  const presenter = TOOL_PRESENTERS[toolName];
  if (presenter) {
    return presenter(input);
  }

  return presentDefaultTool(toolName);
}

const TOOL_PRESENTERS: Record<string, ToolPresenter> = {
  read_file: presentReadFile,
  list_files: presentListFiles,
  glob: presentGlob,
  grep: presentGrepOrSearchCode,
  search_code: presentGrepOrSearchCode,
  write_file: presentWriteFile,
  bash: presentBash,
  git_status: presentGitStatus,
  git_diff: presentGitDiff,
};

function presentReadFile(
  input: Record<string, unknown> | undefined,
): ToolPresentation {
  const path = readString(input?.path);
  return {
    description: path ? `Read ${path}` : "Read file",
    displayText: path ? `Reading ${path}` : "Reading file",
    summary: path
      ? `Reading file contents from ${path}.`
      : "Reading file contents from the workspace.",
  };
}

function presentListFiles(
  input: Record<string, unknown> | undefined,
): ToolPresentation {
  const path = readString(input?.path);
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
  input: Record<string, unknown> | undefined,
): ToolPresentation {
  const pattern = readString(input?.pattern);
  return {
    description: pattern ? `Find ${pattern}` : "Find files",
    displayText: pattern ? `Finding ${pattern}` : "Finding files",
    summary: pattern
      ? `Finding files that match ${pattern}.`
      : "Finding matching files in the workspace.",
  };
}

function presentGrepOrSearchCode(
  input: Record<string, unknown> | undefined,
): ToolPresentation {
  const pattern = readString(input?.pattern);
  const path = readString(input?.path);
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
  input: Record<string, unknown> | undefined,
): ToolPresentation {
  const path = readString(input?.path);
  return {
    description: path ? `Edit ${path}` : "Edit file",
    displayText: path ? `Editing ${path}` : "Editing file",
    summary: path
      ? `Applying a workspace edit to ${path}.`
      : "Applying a workspace edit.",
  };
}

function presentBash(
  input: Record<string, unknown> | undefined,
): ToolPresentation {
  const command = readString(input?.command);
  return {
    description: command ? `Run ${command}` : "Run command",
    displayText: command ? `Running ${command}` : "Running command",
    summary: command
      ? `Running ${command} in the workspace.`
      : "Running a shell command in the workspace.",
  };
}

function presentGitStatus(): ToolPresentation {
  return {
    description: "Check git status",
    displayText: "Checking git status",
    summary: "Checking the current repository status.",
  };
}

function presentGitDiff(
  input: Record<string, unknown> | undefined,
): ToolPresentation {
  const path = readString(input?.path);
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
