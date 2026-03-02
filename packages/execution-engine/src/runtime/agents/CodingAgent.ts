// apps/brain/src/core/agents/CodingAgent.ts
// Phase 3D: Concrete agent for coding tasks (file ops, tests, shell, git)

import type {
  AgentCapability,
  ExecutionContext,
  SynthesisContext,
  AgentType,
  TaskResult,
  TaskInput,
} from "../types.js";
import type { Task } from "../task/index.js";
import type { Plan, PlanContext } from "../planner/index.js";
import { PlanSchema } from "../planner/index.js";
import { BaseAgent } from "./BaseAgent.js";
import { validateSafePath, extractStructuredField } from "./validation.js";
import {
  isConcreteCommandInput,
  isConcretePathInput,
  isValidGitActionInput,
  VALID_GIT_ACTIONS,
} from "../contracts/index.js";
import {
  extractExecutionFailure,
  formatExecutionResult,
  formatTaskOutput,
} from "./ResultFormatter.js";

export class CodingAgent extends BaseAgent {
  readonly type: AgentType = "coding";

  async plan(context: PlanContext): Promise<Plan> {
    console.log(`[agents/coding] Generating plan for run ${context.run.id}`);

    const messages = this.buildPlanMessages(context.run, context.prompt);
    const result = await this.llmGateway.generateStructured({
      context: {
        runId: context.run.id,
        sessionId: context.run.sessionId,
        agentType: this.type,
        phase: "planning",
      },
      messages,
      schema: PlanSchema,
      model: context.run.input.modelId,
      providerId: context.run.input.providerId,
      temperature: 0.2,
    });

    console.log(
      `[agents/coding] Generated plan with ${result.object.tasks.length} tasks`,
    );
    return result.object as Plan;
  }

  async executeTask(
    task: Task,
    context: ExecutionContext,
  ): Promise<TaskResult> {
    console.log(
      `[agents/coding] Executing task ${task.id} (${task.type}) in run ${context.runId}`,
    );

    switch (task.type) {
      case "analyze":
        return this.executeAnalyze(task);
      case "edit":
        return this.executeEdit(task);
      case "test":
        return this.executeTest(task);
      case "shell":
        return this.executeShell(task);
      case "git":
        return this.executeGit(task);
      case "review":
        return this.executeReview(task, context);
      default:
        throw new UnsupportedTaskTypeError(String(task.type));
    }
  }

  async synthesize(context: SynthesisContext): Promise<string> {
    console.log(
      `[agents/coding] Synthesizing results for run ${context.runId}`,
    );

    const taskSummaries = context.completedTasks
      .map(
        (t) =>
          `- Task ${t.id}: ${t.status} — ${formatTaskOutput(t.output?.content)}`,
      )
      .join("\n");

    const result = await this.llmGateway.generateText({
      context: {
        runId: context.runId,
        sessionId: context.sessionId,
        agentType: this.type,
        phase: "synthesis",
      },
      messages: [
        {
          role: "system",
          content:
            "Summarize the completed coding tasks into a concise final report.",
        },
        {
          role: "user",
          content: `Original request: ${context.originalPrompt}\n\nCompleted tasks:\n${taskSummaries}`,
        },
      ],
      model: context.modelId,
      providerId: context.providerId,
    });
    return result.text;
  }

  getCapabilities(): AgentCapability[] {
    return [
      { name: "file_read", description: "Read files from the workspace" },
      { name: "file_edit", description: "Edit and write files" },
      { name: "git_commit", description: "Perform git operations" },
      { name: "test_run", description: "Run test suites" },
      { name: "shell_execute", description: "Execute shell commands" },
    ];
  }

  protected getPlanSystemPrompt(): string {
    return `You are a coding assistant planner. Break down the user's coding request into atomic tasks.

Output a JSON object with this structure:
{
  "tasks": [
    { "id": "1", "type": "analyze|edit|test|review|git|shell", "description": "...", "dependsOn": [], "expectedOutput": "...", "input": {...} }
  ],
  "metadata": { "estimatedSteps": 3, "reasoning": "..." }
}

CRITICAL: Every task MUST have properly structured "input" fields. NEVER put descriptions/titles in the input - use concrete values only.

ANALYZE: MUST extract the actual file path to read
{ "type": "analyze", "description": "Read the README", "input": { "path": "README.md" } }
✗ WRONG: { "input": { "path": "Analyze the current workspace" } }

EDIT: MUST have both path AND the exact content to write
{ "type": "edit", "description": "Create new config file", "input": { "path": "config.json", "content": "{...}" } }
✗ WRONG: { "input": { "path": "src/app.ts", "content": "the new code" } }

TEST: MUST have the exact command to execute
{ "type": "test", "description": "Run tests", "input": { "command": "npm test -- src/service.test.ts" } }
✗ WRONG: { "input": { "command": "If tests fail, fix them" } }

SHELL: MUST have the exact shell command
{ "type": "shell", "description": "Check Node version", "input": { "command": "node --version" } }
✗ WRONG: { "input": { "command": "Check if node is installed" } }

GIT: MUST have the git action (git_commit, git_push, git_status, git_clone, git_branch_list, etc)
{ "type": "git", "description": "Commit changes", "input": { "action": "git_commit", "message": "feat: add new feature" } }
✗ WRONG: { "input": { "action": "commit changes" } }

IMPORTANT TOOL ROUTING:
- NEVER use shell tasks for git commands (git ...)
- Use task type "git" for repository status/diff/branch/commit actions
- Valid git actions: status, diff, stage, unstage, commit, push, git_clone, git_diff, git_commit, git_push, git_pull, git_fetch, git_branch_create, git_branch_switch, git_branch_list, git_stage, git_status, git_config
- Use analyze tasks for file inspection and directory listing

REVIEW: Only LLM task, no input needed - just use description

VALIDATION RULES:
1. Every non-review task MUST have a non-empty "input" object
2. ANALYZE tasks: input.path must be a real file path (max 500 chars)
3. EDIT tasks: input.path AND input.content must both be provided
4. TEST/SHELL: input.command must be an executable command (max 500 chars)
5. GIT: input.action must be a valid git action (git_commit, git_push, git_status, git_clone, etc)
6. NEVER use task description or placeholders in input fields
7. If the user only asks to inspect/read/check, NEVER create edit tasks
8. Only create edit tasks when the user explicitly asks to modify files
9. Start with "analyze" tasks to understand codebase
10. End with "test" tasks only when code changes were requested
11. Keep tasks atomic and under 20 total`;
  }

  private async executeAnalyze(task: Task): Promise<TaskResult> {
    const rawPath =
      extractStructuredField(task.input, "path") ?? task.input.description;
    const path = normalizeTaskPath(rawPath);
    validateTaskPath(path);
    validateSafePath(path);

    const readResult = await this.executionService.execute(
      "filesystem",
      "read_file",
      {
        path,
      },
    );
    const readFailure = extractExecutionFailure(readResult);
    if (!readFailure) {
      return this.buildSuccessResult(task.id, formatExecutionResult(readResult));
    }

    if (looksLikeDirectoryError(readFailure)) {
      const listResult = await this.executionService.execute(
        "filesystem",
        "list_files",
        { path },
      );
      const listFailure = extractExecutionFailure(listResult);
      if (!listFailure) {
        const listed = formatExecutionResult(listResult);
        return this.buildSuccessResult(
          task.id,
          `Requested path is a directory. Listing ${path}:\n${listed}`,
        );
      }
    }

    return this.buildFailureResult(task.id, readFailure);
  }

  private async executeEdit(task: Task): Promise<TaskResult> {
    const rawPath =
      extractStructuredField(task.input, "path") ?? task.input.description;
    const path = normalizeTaskPath(rawPath);
    validateTaskPath(path);
    validateSafePath(path);

    const content = extractStructuredField(task.input, "content");
    if (!content) {
      throw new TaskInputError("edit", "Missing 'content' field in task input");
    }

    const result = await this.executionService.execute(
      "filesystem",
      "write_file",
      {
        path,
        content,
      },
    );
    const failure = extractExecutionFailure(result);
    if (failure) {
      return this.buildFailureResult(task.id, failure);
    }

    return this.buildSuccessResult(task.id, formatExecutionResult(result));
  }

  private async executeTest(task: Task): Promise<TaskResult> {
    const command =
      extractStructuredField(task.input, "command") ?? task.input.description;
    validateShellCommand(command);

    const result = await this.executionService.execute("node", "run", {
      command,
    });
    const failure = extractExecutionFailure(result);
    if (failure) {
      return this.buildFailureResult(task.id, failure);
    }

    return this.buildSuccessResult(task.id, formatExecutionResult(result));
  }

  private async executeShell(task: Task): Promise<TaskResult> {
    const command =
      extractStructuredField(task.input, "command") ?? task.input.description;
    validateShellCommand(command);

    const normalizedCommand = command.trim();
    if (/^git(\s|$)/i.test(normalizedCommand)) {
      return this.buildFailureResult(
        task.id,
        "Git shell commands are not allowed in shell tasks. Use a git task action instead.",
      );
    }

    if (/^ls(\s|$)/i.test(normalizedCommand)) {
      const path = extractDirectoryFromLsCommand(normalizedCommand);
      const listResult = await this.executionService.execute(
        "filesystem",
        "list_files",
        { path },
      );
      const failure = extractExecutionFailure(listResult);
      if (failure) {
        return this.buildFailureResult(task.id, failure);
      }
      return this.buildSuccessResult(task.id, formatExecutionResult(listResult));
    }

    const result = await this.executionService.execute("node", "run", {
      command,
    });
    const failure = extractExecutionFailure(result);
    if (failure) {
      return this.buildFailureResult(task.id, failure);
    }

    return this.buildSuccessResult(task.id, formatExecutionResult(result));
  }

  private async executeGit(task: Task): Promise<TaskResult> {
    const action = extractStructuredField(task.input, "action");
    if (!action) {
      throw new TaskInputError(
        "git",
        "Missing 'action' field in task input (e.g., 'commit', 'push', 'status')",
      );
    }
    validateGitAction(action);

    const result = await this.executionService.execute("git", action, {
      message: extractStructuredField(task.input, "message") ?? task.input.description,
    });
    const failure = extractExecutionFailure(result);
    if (failure) {
      return this.buildFailureResult(task.id, failure);
    }

    return this.buildSuccessResult(task.id, formatExecutionResult(result));
  }

  private async executeReview(
    task: Task,
    context: ExecutionContext,
  ): Promise<TaskResult> {
    const result = await this.llmGateway.generateText({
      context: {
        runId: task.runId,
        sessionId: context.sessionId,
        taskId: task.id,
        agentType: this.type,
        phase: "task",
      },
      messages: [
        {
          role: "system",
          content: "Review the following code and provide feedback.",
        },
        { role: "user", content: task.input.description },
      ],
      model: context.modelId,
      providerId: context.providerId,
    });
    return this.buildSuccessResult(task.id, result.text);
  }

  private buildSuccessResult(taskId: string, content: string): TaskResult {
    return {
      taskId,
      status: "DONE",
      output: { content },
      completedAt: new Date(),
    };
  }

  private buildFailureResult(taskId: string, message: string): TaskResult {
    return {
      taskId,
      status: "FAILED",
      error: { message },
      completedAt: new Date(),
    };
  }
}

function validateGitAction(action: string): void {
  if (!isValidGitActionInput(action)) {
    throw new TaskInputError(
      "git",
      `Invalid git action: "${action}". Allowed: ${VALID_GIT_ACTIONS.join(", ")}`,
    );
  }
}

function validateShellCommand(command: string): void {
  if (!isConcreteCommandInput(command)) {
    throw new TaskInputError(
      "shell",
      "Shell command must be a concrete non-empty command",
    );
  }
}

function normalizeTaskPath(input: string): string {
  const trimmed = input.trim().replace(/^['"`]+|['"`]+$/g, "");
  const withoutMention = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const cleaned = withoutMention.replace(/[?!.,;:]+$/g, "");

  const normalizedLower = cleaned.toLowerCase();
  const aliases: Record<string, string> = {
    readme: "README.md",
    "readme.md": "README.md",
  };

  return aliases[normalizedLower] ?? cleaned;
}

function validateTaskPath(path: string): void {
  if (!isConcretePathInput(path)) {
    throw new TaskInputError(
      "path",
      "Task path must be a concrete non-empty file path",
    );
  }
}

function looksLikeDirectoryError(message: string): boolean {
  return /is a directory/i.test(message);
}

function extractDirectoryFromLsCommand(command: string): string {
  const segments = command.split(/\s+/).slice(1);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i];
    if (!segment || segment.startsWith("-")) {
      continue;
    }
    return segment;
  }
  return ".";
}

export class UnsupportedTaskTypeError extends Error {
  constructor(taskType: string) {
    super(`[agents/coding] Unsupported task type: ${taskType}`);
    this.name = "UnsupportedTaskTypeError";
  }
}

export class TaskInputError extends Error {
  constructor(taskType: string, message: string) {
    super(`[agents/coding] ${taskType}: ${message}`);
    this.name = "TaskInputError";
  }
}
