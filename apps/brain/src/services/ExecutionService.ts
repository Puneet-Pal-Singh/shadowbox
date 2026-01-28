// apps/brain/src/services/ExecutionService.ts
import { Env, ToolCall } from "../types/ai";
import { AgentOrchestrator } from "../orchestrator/executor";

export interface ToolExecutionResult {
  tool: string;
  result: unknown;
}

export class ExecutionService {
  static async runToolCalls(
    env: Env, 
    sessionId: string, 
    toolCalls: ToolCall[]
  ): Promise<ToolExecutionResult[]> {
    const executor = new AgentOrchestrator(env, sessionId);
    const results: ToolExecutionResult[] = [];

    for (const call of toolCalls) {
      const result = await executor.executeTool(call);
      results.push({ tool: call.name, result });
    }

    return results;
  }
}