// apps/brain/src/core/agents/CodingAgent.ts
// Phase 3D: Concrete agent for coding tasks (file ops, tests, shell, git)

import type {
  AgentCapability,
  PlanContext,
  ExecutionContext,
  SynthesisContext,
  AgentType,
  TaskResult,
} from "../../types";
import type { Task } from "../task";
import type { Plan } from "../planner";
import { PlanSchema } from "../planner";
import { BaseAgent } from "./BaseAgent";

export class CodingAgent extends BaseAgent {
  readonly type: AgentType = "coding";

  async plan(context: PlanContext): Promise<Plan> {
    console.log(`[agents/coding] Generating plan for run ${context.run.id}`);

    const messages = this.buildPlanMessages(context.run, context.prompt);
    const plan = await this.aiService.generateStructured({
      messages,
      schema: PlanSchema,
      temperature: 0.2,
    });

    console.log(
      `[agents/coding] Generated plan with ${plan.tasks.length} tasks`,
    );
    return plan as Plan;
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
        return this.executeAnalyze(task, context);
      case "edit":
        return this.executeEdit(task, context);
      case "test":
        return this.executeTest(task, context);
      case "shell":
        return this.executeShell(task, context);
      case "git":
        return this.executeGit(task, context);
      case "review":
        return this.executeReview(task, context);
      default:
        throw new UnsupportedTaskTypeError(task.type);
    }
  }

  async synthesize(context: SynthesisContext): Promise<string> {
    console.log(`[agents/coding] Synthesizing results for run ${context.runId}`);

    const taskSummaries = context.completedTasks
      .map((t) => `- Task ${t.id}: ${t.status} — ${t.output?.content ?? "no output"}`)
      .join("\n");

    return this.aiService.generateText({
      messages: [
        {
          role: "system",
          content: "Summarize the completed coding tasks into a concise final report.",
        },
        {
          role: "user",
          content: `Original request: ${context.originalPrompt}\n\nCompleted tasks:\n${taskSummaries}`,
        },
      ],
    });
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

Rules:
1. Start with "analyze" tasks to understand the codebase
2. Follow with "edit" tasks to make changes
3. End with "test" tasks to verify
4. Use "git" for version control operations
5. Use "shell" for arbitrary commands
6. Keep tasks atomic and under 20 total`;
  }

  private async executeAnalyze(
    task: Task,
    _context: ExecutionContext,
  ): Promise<TaskResult> {
    const result = await this.executionService.execute("filesystem", "read", {
      path: task.input.description,
    });
    return this.buildSuccessResult(task.id, String(result));
  }

  private async executeEdit(
    task: Task,
    _context: ExecutionContext,
  ): Promise<TaskResult> {
    const result = await this.executionService.execute("filesystem", "write", {
      path: task.input.description,
      content: task.input.expectedOutput ?? "",
    });
    return this.buildSuccessResult(task.id, String(result));
  }

  private async executeTest(
    task: Task,
    _context: ExecutionContext,
  ): Promise<TaskResult> {
    const result = await this.executionService.execute("shell", "execute", {
      command: "npm test",
    });
    return this.buildSuccessResult(task.id, String(result));
  }

  private async executeShell(
    task: Task,
    _context: ExecutionContext,
  ): Promise<TaskResult> {
    const result = await this.executionService.execute("shell", "execute", {
      command: task.input.description,
    });
    return this.buildSuccessResult(task.id, String(result));
  }

  private async executeGit(
    task: Task,
    _context: ExecutionContext,
  ): Promise<TaskResult> {
    const result = await this.executionService.execute(
      "git",
      task.input.description,
      {},
    );
    return this.buildSuccessResult(task.id, String(result));
  }

  private async executeReview(
    task: Task,
    _context: ExecutionContext,
  ): Promise<TaskResult> {
    const content = await this.aiService.generateText({
      messages: [
        { role: "system", content: "Review the following code and provide feedback." },
        { role: "user", content: task.input.description },
      ],
    });
    return this.buildSuccessResult(task.id, content);
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

export class UnsupportedTaskTypeError extends Error {
  constructor(taskType: string) {
    super(`[agents/coding] Unsupported task type: ${taskType}`);
    this.name = "UnsupportedTaskTypeError";
  }
}
