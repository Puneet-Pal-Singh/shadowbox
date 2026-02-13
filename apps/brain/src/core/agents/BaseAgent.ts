// apps/brain/src/core/agents/BaseAgent.ts
// Phase 3D: Abstract base agent with shared planning and execution contracts

import type { AIService } from "../../services/AIService";
import type { ExecutionService } from "../../services/ExecutionService";
import type {
  AgentCapability,
  PlanContext,
  ExecutionContext,
  SynthesisContext,
  IAgent,
  TaskResult,
} from "../../types";
import type { Run } from "../run";
import type { Task } from "../task";
import type { Plan } from "../planner";

export type { AgentCapability, PlanContext, ExecutionContext, SynthesisContext, IAgent };

export abstract class BaseAgent implements IAgent {
  abstract readonly type: string;

  constructor(
    protected readonly aiService: AIService,
    protected readonly executionService: ExecutionService,
  ) {}

  abstract plan(context: PlanContext): Promise<Plan>;
  abstract executeTask(task: Task, context: ExecutionContext): Promise<TaskResult>;
  abstract synthesize(context: SynthesisContext): Promise<string>;

  getCapabilities(): AgentCapability[] {
    return [];
  }

  protected buildPlanMessages(
    run: Run,
    prompt: string,
  ): Array<{ role: "system" | "user"; content: string }> {
    return [
      { role: "system", content: this.getPlanSystemPrompt() },
      { role: "user", content: this.formatPlanUserPrompt(run, prompt) },
    ];
  }

  protected abstract getPlanSystemPrompt(): string;

  private formatPlanUserPrompt(run: Run, prompt: string): string {
    return `Run ID: ${run.id}\nAgent Type: ${run.agentType}\n\nUser Request:\n${prompt}\n\nGenerate a plan to accomplish this request.`;
  }
}
