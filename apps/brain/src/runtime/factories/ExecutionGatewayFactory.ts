/**
 * ExecutionGatewayFactory - Assemble final runtime dependencies.
 *
 * Single Responsibility: Compose all factory outputs into final RunEngineDependencies.
 * Orchestrates LLM gateway, budgeting, agents, and session memory assembly.
 */

import type { RunEngineDependencies, AgentType, IAgent, LLMGateway } from "@shadowbox/execution-engine/runtime";
import type { Env } from "../../types/ai";
import { buildLLMGateway } from "./LLMRuntimeFactory";
import { buildPricingAndBudgeting } from "./BudgetingFactory";
import { resolveAgent } from "./AgentFactory";
import { buildSessionMemoryClient } from "./SessionMemoryFactory";
import type { ExecuteRunPayload } from "../parsing/ExecuteRunPayloadSchema";

/**
 * Build complete runtime dependencies for RunEngine execution.
 *
 * Assembles:
 * - LLM gateway with AI service
 * - Cost tracking and budgeting
 * - Resolved agent
 * - Session memory client
 *
 * @param ctx - Durable Object state context
 * @param env - Cloudflare environment
 * @param payload - Execute run payload with parameters
 * @param options - Execution options (strict mode, etc.)
 * @returns { agent, runEngineDeps }
 */
export function buildRuntimeDependencies(
  ctx: unknown,
  env: Env,
  payload: ExecuteRunPayload,
  options: { strict?: boolean } = {},
): {
  agent: IAgent | undefined;
  runEngineDeps: RunEngineDependencies;
} {
  // Build pricing/budgeting first
  const budgetingComponents = buildPricingAndBudgeting(ctx, env);

  // Build LLM runtime with shared budgeting components
  const { llmRuntimeService, llmGateway } = buildLLMGateway(
    ctx,
    env,
    payload.runId,
    budgetingComponents,
  );

  // Destructure pricing/budgeting components for return object
  const {
    pricingRegistry,
    costLedger,
    costTracker,
    budgetManager,
    pricingResolver,
  } = budgetingComponents;

  // Resolve agent with strict policy
  const agent = resolveAgent(
    env,
    llmGateway,
    payload.sessionId,
    payload.runId,
    payload.input.agentType,
    {
      strict: options.strict ?? true,
      correlationId: payload.correlationId,
    },
  );

  // Build session memory client
  const sessionMemoryClient = buildSessionMemoryClient(
    env,
    payload.sessionId,
  );

  return {
    agent,
    runEngineDeps: {
      aiService: llmRuntimeService,
      llmGateway,
      costLedger,
      costTracker,
      pricingRegistry,
      pricingResolver,
      budgetManager,
      sessionMemoryClient,
    },
  };
}
