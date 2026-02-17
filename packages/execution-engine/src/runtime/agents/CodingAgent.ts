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
        return this.executeReview(task, context.sessionId);
      default:
        throw new UnsupportedTaskTypeError(task.type);
    }
  }

  async synthesize(context: SynthesisContext): Promise<string> {
    console.log(
      `[agents/coding] Synthesizing results for run ${context.runId}`,
    );

    const taskSummaries = context.completedTasks
      .map(
        (t) =>
          `- Task ${t.id}: ${t.status} — ${t.output?.content ?? "no output"}`,
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
    { "id": "1", "type": "analyze|edit|test|review|git|shell", "description": "...", "dependsOn": [], "expectedOutput": "..." }
  ],
  "metadata": { "estimatedSteps": 3, "reasoning": "..." }
}

For "edit" tasks, include a "content" field in the task input with the file content to write.
For "git" tasks, include an "action" field with the git operation (e.g., "commit", "push", "status").
For "test" tasks, include a "command" field with the test command to run (e.g., "npm test").
For "shell" tasks, include a "command" field with the shell command.

Rules:
1. Start with "analyze" tasks to understand the codebase
2. Follow with "edit" tasks to make changes
3. End with "test" tasks to verify
4. Use "git" for version control operations
5. Use "shell" for arbitrary commands
6. Keep tasks atomic and under 20 total`;
  }

  private async executeAnalyze(task: Task): Promise<TaskResult> {
    const path =
      extractStructuredField(task.input, "path") ?? task.input.description;
    validateSafePath(path);

    const result = await this.executionService.execute("filesystem", "read", {
      path,
    });
    return this.buildSuccessResult(task.id, String(result));
  }

  private async executeEdit(task: Task): Promise<TaskResult> {
    const path =
      extractStructuredField(task.input, "path") ?? task.input.description;
    validateSafePath(path);

    const content = extractStructuredField(task.input, "content");
    if (!content) {
      throw new TaskInputError("edit", "Missing 'content' field in task input");
    }

    const result = await this.executionService.execute("filesystem", "write", {
      path,
      content,
    });
    return this.buildSuccessResult(task.id, String(result));
  }

  private async executeTest(task: Task): Promise<TaskResult> {
    const command =
      extractStructuredField(task.input, "command") ?? task.input.description;
    validateShellCommand(command);

    const result = await this.executionService.execute("shell", "execute", {
      command,
    });
    return this.buildSuccessResult(task.id, String(result));
  }

  private async executeShell(task: Task): Promise<TaskResult> {
    const command =
      extractStructuredField(task.input, "command") ?? task.input.description;
    validateShellCommand(command);

    const result = await this.executionService.execute("shell", "execute", {
      command,
    });
    return this.buildSuccessResult(task.id, String(result));
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
      message: task.input.description,
    });
    return this.buildSuccessResult(task.id, String(result));
  }

  private async executeReview(
    task: Task,
    sessionId: string,
  ): Promise<TaskResult> {
    const result = await this.llmGateway.generateText({
      context: {
        runId: task.runId,
        sessionId,
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
}

const ALLOWED_GIT_ACTIONS = [
  "commit",
  "push",
  "pull",
  "status",
  "diff",
  "log",
  "add",
  "checkout",
  "branch",
  "merge",
  "rebase",
  "stash",
  "clone",
  "fetch",
  "reset",
  "tag",
] as const;

function validateGitAction(action: string): void {
  if (
    !ALLOWED_GIT_ACTIONS.includes(
      action as (typeof ALLOWED_GIT_ACTIONS)[number],
    )
  ) {
    throw new TaskInputError(
      "git",
      `Invalid git action: "${action}". Allowed: ${ALLOWED_GIT_ACTIONS.join(", ")}`,
    );
  }
}

function validateShellCommand(command: string): void {
  if (!command || command.trim().length === 0) {
    throw new TaskInputError("shell", "Empty shell command");
  }
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
