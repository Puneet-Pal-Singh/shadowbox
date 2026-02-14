// apps/brain/src/core/agents/BaseAgent.ts
// Phase 3D: Abstract base agent with shared planning and execution contracts

import type {
  AgentCapability,
  ExecutionContext,
  SynthesisContext,
  IAgent,
  RuntimeExecutionService,
  TaskResult,
} from "../types.js";
import type { Run } from "../run/index.js";
import type { Task } from "../task/index.js";
import type { Plan, PlanContext } from "../planner/index.js";
import type { ILLMGateway } from "../llm/index.js";

export type { AgentCapability, PlanContext, ExecutionContext, SynthesisContext, IAgent };

export abstract class BaseAgent implements IAgent {
  abstract readonly type: string;

  constructor(
    protected readonly llmGateway: ILLMGateway,
    protected readonly executionService: RuntimeExecutionService,
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
