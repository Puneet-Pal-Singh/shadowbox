// apps/brain/src/core/agents/ReviewAgent.ts
// Phase 3D: Concrete agent for code review tasks

import type {
  AgentCapability,
  AgentType,
  PlanContext,
  ExecutionContext,
  SynthesisContext,
  TaskResult,
} from "../../types";
import type { Task } from "../task";
import type { Plan } from "../planner";
import { PlanSchema } from "../planner";
import { BaseAgent } from "./BaseAgent";
import { UnsupportedTaskTypeError } from "./CodingAgent";

export class ReviewAgent extends BaseAgent {
  readonly type: AgentType = "review";

  async plan(context: PlanContext): Promise<Plan> {
    console.log(`[agents/review] Generating plan for run ${context.run.id}`);

    const messages = this.buildPlanMessages(context.run, context.prompt);
    const plan = await this.aiService.generateStructured({
      messages,
      schema: PlanSchema,
      temperature: 0.2,
    });

    console.log(
      `[agents/review] Generated plan with ${plan.tasks.length} tasks`,
    );
    return plan as Plan;
  }

  async executeTask(
    task: Task,
    context: ExecutionContext,
  ): Promise<TaskResult> {
    console.log(
      `[agents/review] Executing task ${task.id} (${task.type}) in run ${context.runId}`,
    );

    switch (task.type) {
      case "analyze":
        return this.executeAnalyze(task, context);
      case "review":
        return this.executeReview(task, context);
      default:
        throw new UnsupportedTaskTypeError(task.type);
    }
  }

  async synthesize(context: SynthesisContext): Promise<string> {
    console.log(
      `[agents/review] Synthesizing review for run ${context.runId}`,
    );

    const taskSummaries = context.completedTasks
      .map((t) => `- Task ${t.id}: ${t.status} — ${t.output?.content ?? "no output"}`)
      .join("\n");

    return this.aiService.generateText({
      messages: [
        {
          role: "system",
          content: "Summarize the code review findings into a structured report with issues, suggestions, and overall assessment.",
        },
        {
          role: "user",
          content: `Original request: ${context.originalPrompt}\n\nReview findings:\n${taskSummaries}`,
        },
      ],
    });
  }

  getCapabilities(): AgentCapability[] {
    return [
      { name: "file_read", description: "Read files for review" },
      { name: "code_review", description: "Analyze and review code quality" },
      { name: "suggest_fixes", description: "Suggest code improvements" },
    ];
  }

  protected getPlanSystemPrompt(): string {
    return `You are a code review planner. Break down the review request into analysis tasks.

Output a JSON object with this structure:
{
  "tasks": [
    { "id": "1", "type": "analyze|review", "description": "...", "dependsOn": [], "expectedOutput": "..." }
  ],
  "metadata": { "estimatedSteps": 3, "reasoning": "..." }
}

Rules:
1. Start with "analyze" tasks to read and understand the code
2. Follow with "review" tasks to evaluate quality, patterns, and issues
3. Focus on code quality, security, and best practices
4. Keep tasks atomic and under 20 total`;
  }

  private async executeAnalyze(
    task: Task,
    _context: ExecutionContext,
  ): Promise<TaskResult> {
    const result = await this.executionService.execute("filesystem", "read", {
      path: task.input.description,
    });

    const analysis = await this.aiService.generateText({
      messages: [
        { role: "system", content: "Analyze the following code for quality, patterns, and potential issues." },
        { role: "user", content: String(result) },
      ],
    });

    return this.buildSuccessResult(task.id, analysis);
  }

  private async executeReview(
    task: Task,
    _context: ExecutionContext,
  ): Promise<TaskResult> {
    const content = await this.aiService.generateText({
      messages: [
        {
          role: "system",
          content: "Provide a detailed code review with issues, suggestions, and severity ratings.",
        },
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
