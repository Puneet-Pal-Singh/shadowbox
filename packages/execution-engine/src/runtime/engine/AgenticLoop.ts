/**
 * AgenticLoop - Bounded agentic tool-chaining loop
 *
 * Implements Track 3: Bounded Agentic Loop
 * Executes tools inline and feeds results back to LLM for further action
 */

import type { CoreMessage, CoreTool } from "ai";
import {
  BudgetExceededError,
  SessionBudgetExceededError,
} from "../cost/index.js";
import type { ILLMGateway } from "../llm/index.js";
import type { IBudgetManager } from "../cost/index.js";
import type { TaskExecutor } from "../orchestration/index.js";
import { Task } from "../task/index.js";

export interface AgenticLoopConfig {
  maxSteps: number;
  runId: string;
  sessionId: string;
  budget?: IBudgetManager;
}

interface AgenticLoopToolCall {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
}

export type StopReason =
  | "max_steps_reached"
  | "budget_exceeded"
  | "llm_stop"
  | "tool_error"
  | "cancelled";

export interface AgenticLoopResult {
  stopReason: StopReason;
  messages: CoreMessage[];
  toolExecutionCount: number;
  failedToolCount: number;
  stepsExecuted: number;
}

interface AgenticLoopHooks {
  onAssistantMessage?: (content: string) => Promise<void>;
  onToolRequested?: (toolCall: AgenticLoopToolCall) => Promise<void>;
  onToolStarted?: (toolCall: AgenticLoopToolCall) => Promise<void>;
  onToolCompleted?: (
    toolCall: AgenticLoopToolCall,
    result: unknown,
  ) => Promise<void>;
  onToolFailed?: (
    toolCall: AgenticLoopToolCall,
    error: string,
  ) => Promise<void>;
}

/**
 * AgenticLoop executes a bounded loop of LLM calls and tool execution
 * with explicit stop conditions and budget enforcement
 */
export class AgenticLoop {
  private readonly config: AgenticLoopConfig;
  private readonly llmGateway: ILLMGateway;
  private readonly executor: TaskExecutor;
  private stepsExecuted: number = 0;
  private toolExecutionCount: number = 0;
  private failedToolCount: number = 0;

  constructor(
    config: AgenticLoopConfig,
    llmGateway: ILLMGateway,
    executor: TaskExecutor,
  ) {
    if (config.maxSteps < 1) {
      throw new Error("maxSteps must be >= 1");
    }
    this.config = config;
    this.llmGateway = llmGateway;
    this.executor = executor;
  }

  /**
   * Execute the agentic loop
   * Returns result with explicit stop reason
   */
  async execute(
    initialMessages: CoreMessage[],
    tools: Record<string, CoreTool>,
    context: {
      agentType: string;
      modelId?: string;
      providerId?: string;
      temperature?: number;
    } & AgenticLoopHooks,
  ): Promise<AgenticLoopResult> {
    const messages: CoreMessage[] = [...initialMessages];
    let stopReason: StopReason = "llm_stop";

    for (let step = 0; step < this.config.maxSteps; step++) {
      this.stepsExecuted = step + 1;

      // Check budget before LLM call
       try {
         if (this.config.budget) {
           // Note: AgenticLoop doesn't have actual LLM usage data yet,
           // so we skip budget check here. In production, this would use
           // estimated token counts based on message history.
           const isOverBudget = await this.config.budget.isOverBudget(
             this.config.runId,
           );
           if (isOverBudget) {
             throw new BudgetExceededError(this.config.runId, 0, 0);
           }
         }
       } catch (error) {
         if (
           error instanceof BudgetExceededError ||
           error instanceof SessionBudgetExceededError
         ) {
           console.warn(
             `[agentic-loop] Budget exceeded at step ${step} for run ${this.config.runId}`,
           );
           stopReason = "budget_exceeded";
           break;
         }
         throw error;
       }

      console.log(
        `[agentic-loop] Step ${step + 1}/${this.config.maxSteps} for run ${this.config.runId}`,
      );

      // Call LLM with tool definitions for this step.
      let response;
      try {
        response = await this.llmGateway.generateText({
          context: {
            runId: this.config.runId,
            sessionId: this.config.sessionId,
            agentType: context.agentType,
            phase: "task",
          },
          messages,
          tools,
          model: context.modelId,
          providerId: context.providerId,
          temperature: context.temperature,
        });
      } catch (error) {
        console.error(
          `[agentic-loop] LLM call failed at step ${step}:`,
          error,
        );
        throw error;
      }

      // Add LLM response to messages
      messages.push({
        role: "assistant",
        content: response.text,
      });
      await context.onAssistantMessage?.(response.text);

      // Check if LLM requested tool calls
      if (!response.toolCalls || response.toolCalls.length === 0) {
        console.log(
          `[agentic-loop] LLM finished (no tool calls) at step ${step}`,
        );
        stopReason = "llm_stop";
        break;
      }

      // Execute requested tools
      const toolResults: Array<{
        toolId: string;
        toolName: string;
        result: unknown;
        error?: string;
      }> = [];

      for (const toolCall of response.toolCalls) {
        this.toolExecutionCount++;
        await context.onToolRequested?.(toolCall);

        // Check budget before tool execution
         try {
           if (this.config.budget) {
             const isOverBudget = await this.config.budget.isOverBudget(
               this.config.runId,
             );
             if (isOverBudget) {
               throw new BudgetExceededError(this.config.runId, 0, 0);
             }
           }
         } catch (error) {
           if (
             error instanceof BudgetExceededError ||
             error instanceof SessionBudgetExceededError
           ) {
             console.warn(
               `[agentic-loop] Budget exceeded during tool execution for run ${this.config.runId}`,
             );
             stopReason = "budget_exceeded";
             break;
           }
           throw error;
         }

        // Execute tool
        try {
          if (!tools[toolCall.toolName]) {
            this.failedToolCount++;
            const message = `Tool "${toolCall.toolName}" is not registered for this run`;
            console.warn(
              `[agentic-loop] ${message} (call: ${toolCall.id})`,
            );
            await context.onToolFailed?.(toolCall, message);
            toolResults.push({
              toolId: toolCall.id,
              toolName: toolCall.toolName,
              result: null,
              error: message,
            });
            continue;
          }

          console.log(
            `[agentic-loop] Executing tool: ${toolCall.toolName} (call: ${toolCall.id})`,
          );

          const toolTask = this.createToolTask(toolCall.id, toolCall);
          await context.onToolStarted?.(toolCall);

          const result = await this.executor.execute(toolTask);

          if (result.status === "DONE") {
            await context.onToolCompleted?.(
              toolCall,
              result.output?.content ?? null,
            );
            toolResults.push({
              toolId: toolCall.id,
              toolName: toolCall.toolName,
              result: result.output?.content,
            });
          } else {
            this.failedToolCount++;
            const toolError = result.error?.message || "Tool execution failed";
            await context.onToolFailed?.(toolCall, toolError);
            toolResults.push({
              toolId: toolCall.id,
              toolName: toolCall.toolName,
              result: null,
              error: toolError,
            });
          }
        } catch (error) {
          this.failedToolCount++;
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          await context.onToolFailed?.(toolCall, errorMessage);
          console.error(
            `[agentic-loop] Tool execution failed: ${toolCall.toolName}`,
            error,
          );
          toolResults.push({
            toolId: toolCall.id,
            toolName: toolCall.toolName,
            result: null,
            error: errorMessage,
          });
        }
      }

      // If budget exceeded during tool execution, stop loop
      if (stopReason === "budget_exceeded") {
        break;
      }

      // Add tool results to messages for next LLM call
      if (toolResults.length > 0) {
        messages.push({
          role: "user",
          content: JSON.stringify({
            toolResults,
            timestamp: new Date().toISOString(),
          }),
        });
      }

      if (toolResults.some((result) => Boolean(result.error))) {
        stopReason = "tool_error";
        break;
      }

      // Check if we should continue
      if (step === this.config.maxSteps - 1) {
        console.log(
          `[agentic-loop] Max steps reached (${this.config.maxSteps}) for run ${this.config.runId}`,
        );
        stopReason = "max_steps_reached";
        break;
      }
    }

    console.log(
      `[agentic-loop] Finished for run ${this.config.runId}: stopReason=${stopReason}, steps=${this.stepsExecuted}, tools=${this.toolExecutionCount}`,
    );

    return {
      stopReason,
      messages,
      toolExecutionCount: this.toolExecutionCount,
      failedToolCount: this.failedToolCount,
      stepsExecuted: this.stepsExecuted,
    };
  }

  /**
   * Get current loop statistics
   */
  getStats() {
    return {
      stepsExecuted: this.stepsExecuted,
      toolExecutionCount: this.toolExecutionCount,
      failedToolCount: this.failedToolCount,
      maxSteps: this.config.maxSteps,
    };
  }

  /**
   * Reset counters (for testing)
   */
  reset() {
    this.stepsExecuted = 0;
    this.toolExecutionCount = 0;
    this.failedToolCount = 0;
  }

  private createToolTask(
    id: string,
    toolCall: Pick<AgenticLoopToolCall, "toolName" | "args">,
  ): Task {
    return new Task(id, this.config.runId, toolCall.toolName, "PENDING", [], {
      description: `Execute ${toolCall.toolName}`,
      ...toolCall.args,
    });
  }
}
