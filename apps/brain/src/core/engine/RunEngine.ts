// apps/brain/src/core/engine/RunEngine.ts
// Phase 3A: Minimal RunEngine that wraps StreamOrchestratorService
// Creates Run/Task metadata without changing existing behavior

import type { DurableObjectState } from "@cloudflare/workers-types";
import type { CoreMessage, CoreTool } from "ai";
import { Run, RunRepository } from "../run";
import { Task, TaskRepository } from "../task";
import { CostTracker } from "../cost";
import { StreamOrchestratorService } from "../../services/StreamOrchestratorService";
import { AIService } from "../../services/AIService";
import type { Env } from "../../types/ai";
import type {
  RunInput,
  RunResult,
  RunStatus,
  AgentType,
  CostSnapshot,
} from "../../types";

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
 * Phase 3A RunEngine - Foundation Layer
 *
 * This minimal implementation:
 * 1. Creates Run entity and persists it
 * 2. Creates a single Task representing the entire execution
 * 3. Wraps existing StreamOrchestratorService (no behavior change)
 * 4. Tracks costs via CostTracker
 * 5. Updates Run/Task status as execution progresses
 *
 * Future phases will replace the wrapped orchestrator with explicit task planning.
 */
export class RunEngine implements IRunEngine {
  private runRepo: RunRepository;
  private taskRepo: TaskRepository;
  private costTracker: CostTracker;
  private streamOrchestrator: StreamOrchestratorService;
  private aiService: AIService;

  constructor(
    private ctx: DurableObjectState,
    private options: RunEngineOptions,
  ) {
    this.runRepo = new RunRepository(ctx);
    this.taskRepo = new TaskRepository(ctx);
    this.costTracker = new CostTracker(ctx);
    this.aiService = new AIService(options.env);
    this.streamOrchestrator = new StreamOrchestratorService(
      this.aiService,
      options.env,
    );
  }

  async execute(
    input: RunInput,
    messages: CoreMessage[],
    tools: Record<string, CoreTool>,
  ): Promise<Response> {
    const { runId, sessionId, correlationId, requestOrigin } = this.options;

    // 1. Create or load the Run
    const run = await this.getOrCreateRun(input, runId, sessionId);

    // 2. Create initial task (represents entire Phase 3A execution)
    const task = await this.createExecutionTask(run.id);

    // 3. Transition run through PLANNING to RUNNING
    // Phase 3A: Simple flow - CREATED -> RUNNING (skip PLANNING for now)
    // In Phase 3B, this will be: CREATED -> PLANNING -> RUNNING
    run.transition("RUNNING");
    await this.runRepo.update(run);

    // 4. Update task to RUNNING
    task.transition("RUNNING");
    await this.taskRepo.update(task);

    console.log(`[run/engine] Starting execution for run ${runId}`);

    try {
      // 5. Delegate to existing StreamOrchestratorService
      // This maintains backward compatibility while we build Phase 3 infrastructure
      const response = await this.streamOrchestrator.createStream({
        messages,
        fullHistory: messages,
        systemPrompt: this.buildSystemPrompt(input),
        tools,
        correlationId,
        sessionId,
        runId,
        requestOrigin,
        onFinish: async (result) => {
          // 6. Record cost
          // TODO: Extract actual model from result in Phase 3B
          // For now, use a default model identifier
          const modelName = "llama-3.3-70b-versatile"; // This should come from result.response?.model
          await this.recordCost(runId, result.usage, modelName);

          // 7. Complete task
          task.transition("DONE", {
            output: {
              content: result.text,
              metadata: {
                finishReason: result.finishReason,
                toolCalls: result.toolCalls?.length || 0,
              },
            },
          });
          await this.taskRepo.update(task);

          // 8. Complete run
          run.transition("COMPLETED");
          run.output = { content: result.text };
          await this.runRepo.update(run);

          console.log(`[run/engine] Completed run ${runId}`);

          // Call original onFinish if needed
          await this.handleOnFinish(result);
        },
      });

      return response;
    } catch (error) {
      // Handle failure
      await this.handleExecutionError(run, task, error);
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

  private async createExecutionTask(runId: string): Promise<Task> {
    // Use crypto.randomUUID() for collision-safe task IDs
    const taskId = `exec-${crypto.randomUUID()}`;
    const task = new Task(
      taskId,
      runId,
      "shell", // Generic type for Phase 3A wrapped execution
      "PENDING",
      [], // No dependencies in Phase 3A
      {
        description: "Execute user request via AI orchestration",
        expectedOutput: "Completed execution with results",
      },
    );

    await this.taskRepo.create(task);
    console.log(`[run/engine] Created task ${taskId} for run ${runId}`);

    return task;
  }

  private buildSystemPrompt(input: RunInput): string {
    // Simple system prompt construction
    // In future phases, this will be more sophisticated with agent-specific prompts
    return `You are a helpful coding assistant. Agent type: ${input.agentType}`;
  }

  private async recordCost(
    runId: string,
    usage: { promptTokens: number; completionTokens: number },
    model: string,
  ): Promise<void> {
    try {
      await this.costTracker.recordUsage(runId, {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        model,
      });

      const snapshot = await this.costTracker.getCostSnapshot(runId);
      console.log(
        `[run/engine] Cost for run ${runId}: $${snapshot.totalCost.toFixed(4)}`,
      );
    } catch (error) {
      // Don't fail execution if cost tracking fails
      console.error(`[run/engine] Cost tracking error:`, error);
    }
  }

  private async handleExecutionError(
    run: Run,
    task: Task,
    error: unknown,
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Update task
    task.transition("FAILED", {
      error: {
        message: errorMessage,
      },
    });
    await this.taskRepo.update(task);

    // Update run
    run.transition("FAILED");
    run.metadata.error = errorMessage;
    await this.runRepo.update(run);

    console.error(`[run/engine] Run ${run.id} failed:`, errorMessage);
  }

  private async handleOnFinish(result: {
    text: string;
    usage: { promptTokens: number; completionTokens: number };
  }): Promise<void> {
    // Placeholder for any additional onFinish logic
    // In Phase 3B+, this will synthesize final results
    console.log(
      `[run/engine] Execution finished. Tokens: ${result.usage.promptTokens + result.usage.completionTokens}`,
    );
  }

  /**
   * Get the current cost snapshot for a run
   */
  async getCostSnapshot(runId: string): Promise<CostSnapshot> {
    return this.costTracker.getCostSnapshot(runId);
  }

  /**
   * Get all tasks for a run
   */
  async getTasksForRun(runId: string) {
    return this.taskRepo.getByRun(runId);
  }

  /**
   * Get run details
   */
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
