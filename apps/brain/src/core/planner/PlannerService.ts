// apps/brain/src/core/planner/PlannerService.ts
// Phase 3B: LLM-based planning service that generates execution plans

import type { Run } from "../run";
import { PlanSchema, type Plan } from "./PlanSchema";
import type { ILLMGateway } from "../llm";

export interface IPlannerService {
  plan(run: Run, prompt: string): Promise<Plan>;
}

export interface PlanContext {
  run: Run;
  prompt: string;
  history?: string;
}

export class PlannerService implements IPlannerService {
  constructor(private llmGateway: ILLMGateway) {}

  async plan(run: Run, prompt: string): Promise<Plan> {
    const messages = this.buildMessages(run, prompt);

    console.log(`[planner/service] Generating plan for run ${run.id}`);

    const plan = await this.callLLM(run, messages);

    console.log(
      `[planner/service] Generated plan with ${plan.tasks.length} tasks`,
    );

    return plan;
  }

  private buildMessages(
    run: Run,
    prompt: string,
  ): Array<{
    role: "system" | "user";
    content: string;
  }> {
    return [
      {
        role: "system",
        content: this.getSystemPrompt(),
      },
      {
        role: "user",
        content: this.formatUserPrompt(run, prompt),
      },
    ];
  }

  private getSystemPrompt(): string {
    return `You are a planning assistant. Given a user request, break it down into a structured plan of tasks.

Output a JSON object with this exact structure:
{
  "tasks": [
    {
      "id": "1",
      "type": "analyze|edit|test|review|git|shell",
      "description": "What this task does",
      "dependsOn": [],
      "expectedOutput": "What should be produced"
    }
  ],
  "metadata": {
    "estimatedSteps": 3,
    "reasoning": "Brief explanation of the approach"
  }
}

Rules:
1. Task IDs should be simple strings like "1", "2", "3"
2. Use dependsOn to specify dependencies (e.g., ["1"] means depends on task 1)
3. Types: analyze (understand code), edit (modify files), test (run tests), review (check work), git (git operations), shell (commands)
4. Tasks should be atomic and focused
5. Keep tasks under 20 total`;
  }

  private formatUserPrompt(run: Run, prompt: string): string {
    return `Run ID: ${run.id}
Agent Type: ${run.agentType}

User Request:
${prompt}

Generate a plan to accomplish this request.`;
  }

  private async callLLM(
    run: Run,
    messages: Array<{ role: "system" | "user"; content: string }>,
  ): Promise<Plan> {
    try {
      const result = await this.llmGateway.generateStructured({
        context: {
          runId: run.id,
          sessionId: run.sessionId,
          agentType: run.agentType,
          phase: "planning",
        },
        messages,
        schema: PlanSchema,
        temperature: 0.2, // Deterministic planning
      });
      return result.object as Plan;
    } catch (error) {
      console.error("[planner/service] Failed to generate plan:", error);
      throw new PlannerError("Failed to generate valid plan from LLM");
    }
  }
}

export class PlannerError extends Error {
  constructor(message: string) {
    super(`[planner/service] ${message}`);
    this.name = "PlannerError";
  }
}
