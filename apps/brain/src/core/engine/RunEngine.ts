// apps/brain/src/core/engine/RunEngine.ts
// Phase 3B: RunEngine with explicit planning and task orchestration
// Phase 3D: Added IAgent-based routing for agent-driven execution

import type { DurableObjectState } from "@cloudflare/workers-types";
import type { CoreMessage, CoreTool } from "ai";
import { Run, RunRepository } from "../run";
import { Task, TaskRepository } from "../task";
import { CostTracker } from "../cost";
import { PlannerService } from "../planner";
import { TaskScheduler } from "../orchestration";
import { DefaultTaskExecutor, AgentTaskExecutor } from "./TaskExecutor";
import { AIService } from "../../services/AIService";
import type { Env } from "../../types/ai";
import type { RunInput, RunResult, RunStatus, CostSnapshot, IAgent } from "../../types";
import type { Plan, PlannedTask } from "../planner";
import { CORS_HEADERS } from "../../lib/cors";

export interface IRunEngine {
  execute(
    input: RunInput,
    messages: CoreMessage[],
    tools: Record<string, CoreTool>,
  ): Promise<Response>;
  getRunStatus(runId: string): Promise<RunStatus | null>;
  cancel(runId: string): Promise<boolean>;
}

export interface RunEngineOptions {
  env: Env;
  sessionId: string;
  runId: string;
  correlationId: string;
  requestOrigin?: string;
}

/**
 * Phase 3B RunEngine - Explicit Planning Layer
 *
 * This implementation:
 * 1. Generates a plan using PlannerService (LLM → JSON plan)
 * 2. Creates tasks from the plan
 * 3. Executes tasks sequentially using TaskScheduler
 * 4. Synthesizes final result with LLM
 * 5. Brain controls execution flow (not LLM via maxSteps)
 *
 * Key changes from Phase 3A:
 * - Replaced wrapped StreamOrchestratorService
 * - Added explicit planning step
 * - Sequential task execution
 * - Brain controls tool execution
 */
export class RunEngine implements IRunEngine {
  private runRepo: RunRepository;
  private taskRepo: TaskRepository;
  private costTracker: CostTracker;
  private planner: PlannerService;
  private scheduler: TaskScheduler;
  private aiService: AIService;
  private agent?: IAgent;

  constructor(
    ctx: DurableObjectState,
    private options: RunEngineOptions,
    agent?: IAgent,
  ) {
    this.runRepo = new RunRepository(ctx);
    this.taskRepo = new TaskRepository(ctx);
    this.costTracker = new CostTracker(ctx);
    this.aiService = new AIService(options.env);
    this.planner = new PlannerService(this.aiService);
    this.agent = agent;

    const taskExecutor = agent
      ? new AgentTaskExecutor(agent, options.runId)
      : new DefaultTaskExecutor();
    this.scheduler = new TaskScheduler(this.taskRepo, taskExecutor);
  }

  async execute(
    input: RunInput,
    messages: CoreMessage[],
    _tools: Record<string, CoreTool>, // Intentionally unused - Phase 3B uses explicit planning instead of tool loop
  ): Promise<Response> {
    const { runId, sessionId } = this.options;

    try {
      // 1. Create or load the Run
      const run = await this.getOrCreateRun(input, runId, sessionId);

      // 2. PLANNING PHASE - Generate execution plan
      console.log(`[run/engine] Planning phase for run ${runId}`);
      try {
        run.transition("PLANNING");
        await this.runRepo.update(run);

        const plan = await this.generatePlan(run, input.prompt);
        console.log(
          `[run/engine] Generated plan with ${plan.tasks.length} tasks`,
        );

        // 3. Create tasks from plan
        await this.createTasksFromPlan(run.id, plan);
      } catch (planError) {
        // If planning fails, transition to FAILED and re-throw
        run.transition("FAILED");
        run.metadata.error =
          planError instanceof Error
            ? planError.message
            : "Planning phase failed";
        await this.runRepo.update(run);
        throw planError;
      }

      // 4. EXECUTION PHASE - Run tasks sequentially
      console.log(`[run/engine] Execution phase for run ${runId}`);
      run.transition("RUNNING");
      await this.runRepo.update(run);

      await this.scheduler.execute(run.id);

      // 5. SYNTHESIS PHASE - Generate final response
      console.log(`[run/engine] Synthesis phase for run ${runId}`);
      const finalOutput = await this.generateSynthesis(run.id, input.prompt);

      // 6. Complete the run
      run.transition("COMPLETED");
      run.output = { content: finalOutput };
      await this.runRepo.update(run);

      console.log(`[run/engine] Completed run ${runId}`);

      // Return streaming response with final result
      return this.createStreamResponse(finalOutput);
    } catch (error) {
      await this.handleExecutionError(runId, error);
      throw error;
    }
  }

  async getRunStatus(runId: string): Promise<RunStatus | null> {
    const run = await this.runRepo.getById(runId);
    return run?.status ?? null;
  }

  async cancel(runId: string): Promise<boolean> {
    const run = await this.runRepo.getById(runId);
    if (
      !run ||
      run.status === "COMPLETED" ||
      run.status === "FAILED" ||
      run.status === "CANCELLED"
    ) {
      return false;
    }

    run.transition("CANCELLED");
    await this.runRepo.update(run);

    // Cancel all pending/running tasks
    const tasks = await this.taskRepo.getByRun(runId);
    for (const task of tasks) {
      if (["PENDING", "READY", "RUNNING"].includes(task.status)) {
        task.transition("CANCELLED");
        await this.taskRepo.update(task);
      }
    }

    console.log(`[run/engine] Cancelled run ${runId}`);
    return true;
  }

  private async getOrCreateRun(
    input: RunInput,
    runId: string,
    sessionId: string,
  ): Promise<Run> {
    const existing = await this.runRepo.getById(runId);
    if (existing) {
      return existing;
    }

    const run = new Run(
      runId,
      sessionId,
      "CREATED",
      input.agentType,
      input,
      undefined,
      { prompt: input.prompt },
    );

    await this.runRepo.create(run);
    console.log(`[run/engine] Created new run ${runId}`);

    return run;
  }

  private async createTasksFromPlan(runId: string, plan: Plan): Promise<void> {
    for (const plannedTask of plan.tasks) {
      const task = this.createTaskFromPlanned(runId, plannedTask);
      await this.taskRepo.create(task);
    }

    console.log(
      `[run/engine] Created ${plan.tasks.length} tasks for run ${runId}`,
    );
  }

  private createTaskFromPlanned(runId: string, planned: PlannedTask): Task {
    return new Task(
      planned.id,
      runId,
      planned.type,
      "PENDING",
      planned.dependsOn,
      {
        description: planned.description,
        expectedOutput: planned.expectedOutput,
      },
    );
  }

  private async generatePlan(run: Run, prompt: string): Promise<Plan> {
    if (this.agent) {
      console.log(`[run/engine] Using agent-based planning (${this.agent.type})`);
      return this.agent.plan({ run, prompt, history: undefined });
    }
    return this.planner.plan(run, prompt);
  }

  private async generateSynthesis(
    runId: string,
    originalPrompt: string,
  ): Promise<string> {
    if (this.agent) {
      console.log(`[run/engine] Using agent-based synthesis (${this.agent.type})`);
      const tasks = await this.taskRepo.getByRun(runId);
      const completedTasks = tasks
        .filter((t) => t.status === "DONE")
        .map((t) => t.toJSON());
      return this.agent.synthesize({ runId, completedTasks, originalPrompt });
    }
    return this.synthesizeResult(runId, originalPrompt);
  }

  private async synthesizeResult(
    runId: string,
    originalPrompt: string,
  ): Promise<string> {
    const tasks = await this.taskRepo.getByRun(runId);
    const completedTasks = tasks.filter((t) => t.status === "DONE");

    // Build context from completed tasks
    const taskResults = completedTasks
      .map(
        (t) =>
          `- ${t.type}: ${t.input.description}\n  Result: ${t.output?.content || "N/A"}`,
      )
      .join("\n");

    const synthesisPrompt = `Based on the following completed tasks, provide a final summary:

Original Request: ${originalPrompt}

Completed Tasks:
${taskResults}

Provide a concise summary of what was accomplished.`;

    // Use AIService to generate synthesis with streaming
    const messages = [
      {
        role: "system" as const,
        content: "You are a helpful assistant summarizing task results.",
      },
      { role: "user" as const, content: synthesisPrompt },
    ];

    try {
      const response = await this.aiService.generateText({
        messages,
        temperature: 0.7,
      });
      return response;
    } catch (error) {
      console.error("[run/engine] Synthesis failed:", error);
      // Fallback to simple summary if LLM call fails
      return `## Summary\n\nCompleted ${completedTasks.length} tasks for your request.\n\n${taskResults}`;
    }
  }

  private createStreamResponse(content: string): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(content));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  }

  private async handleExecutionError(
    runId: string,
    error: unknown,
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    try {
      const run = await this.runRepo.getById(runId);
      if (run) {
        run.transition("FAILED");
        run.metadata.error = errorMessage;
        await this.runRepo.update(run);
      }
    } catch (handlerError) {
      // Log handler error but don't re-throw to avoid masking original error
      console.error(
        `[run/engine] Failed to handle execution error for run ${runId}:`,
        handlerError,
      );
    }

    console.error(`[run/engine] Run ${runId} failed:`, errorMessage);
  }

  async getCostSnapshot(runId: string): Promise<CostSnapshot> {
    return this.costTracker.getCostSnapshot(runId);
  }

  async getTasksForRun(runId: string) {
    return this.taskRepo.getByRun(runId);
  }

  async getRun(runId: string) {
    return this.runRepo.getById(runId);
  }
}

export class RunEngineError extends Error {
  constructor(message: string) {
    super(`[run/engine] ${message}`);
    this.name = "RunEngineError";
  }
}
