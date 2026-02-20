/**
 * AgentFactory - Build agent registry and resolve requested agent.
 *
 * Single Responsibility: Create agent registry and validate agent type against policy.
 * Encapsulates agent instantiation and type resolution.
 */

import type { LLMGateway, IAgent, AgentType } from "@shadowbox/execution-engine/runtime";
import { AgentRegistry, CodingAgent, ReviewAgent } from "@shadowbox/execution-engine/runtime/agents";
import { resolveAgentType } from "../policies/AgentTypePolicy";
import { ExecutionService } from "../../services/ExecutionService";
import type { Env } from "../../types/ai";

/**
 * Build agent registry, resolve requested agent type, and return resolved agent.
 *
 * @param env - Cloudflare environment
 * @param llmGateway - LLM gateway for agent initialization
 * @param sessionId - Session ID for execution service
 * @param runId - Run ID for execution service
 * @param requestedAgentType - Requested agent type from payload
 * @param options - Policy options (strict mode, etc.)
 * @returns Resolved IAgent or undefined
 * @throws PolicyError if strict mode and agent type unsupported
 */
export function resolveAgent(
  env: Env,
  llmGateway: LLMGateway,
  sessionId: string,
  runId: string,
  requestedAgentType: AgentType,
  options: { strict?: boolean; correlationId?: string } = {},
): IAgent | undefined {
  const executionService = new ExecutionService(env, sessionId, runId);

  const runtimeExecutionService = {
    execute: (
      plugin: string,
      action: string,
      payloadData: Record<string, unknown>,
    ) => executionService.execute(plugin, action, payloadData),
  };

  const registry = buildAgentRegistry(llmGateway, runtimeExecutionService);

  // Resolve agent type with policy enforcement
  const resolvedAgentType = resolveAgentType(
    requestedAgentType,
    registry,
    options,
  );

  return registry.get(resolvedAgentType);
}

/**
 * Build agent registry with all available agents.
 *
 * @param llmGateway - LLM gateway for agent initialization
 * @param runtimeExecutionService - Execution service for agents
 * @returns Populated AgentRegistry
 */
function buildAgentRegistry(
  llmGateway: LLMGateway,
  runtimeExecutionService: {
    execute: (
      plugin: string,
      action: string,
      payloadData: Record<string, unknown>,
    ) => Promise<unknown>;
  },
): AgentRegistry {
  const registry = new AgentRegistry();
  registry.register(new CodingAgent(llmGateway, runtimeExecutionService));
  registry.register(new ReviewAgent(llmGateway, runtimeExecutionService));
  return registry;
}
