/**
 * RuntimeCompositionFactory - Wire port-based runtime composition.
 *
 * Single Responsibility: Compose runtime orchestration using boundary ports.
 * Decouples core orchestration logic from infrastructure-specific wiring.
 *
 * Replaces direct Cloudflare dependency in core paths with port-based injection.
 * Aligns to:
 * - Charter 46: Canonical port mapping
 * - Plan 59: Decoupled runtime architecture
 * - PORTABILITY-BOUNDARY-DECOUPLING-PLAN: Boundary extraction
 */

import type { Env } from "../../types/ai";
import { createRuntimePorts, type RuntimePorts } from "./PortalityAdapterFactory";
import { buildLLMGateway } from "./LLMRuntimeFactory";
import { buildPricingAndBudgeting } from "./BudgetingFactory";
import { resolveAgent } from "./AgentFactory";
import { buildSessionMemoryClient } from "./SessionMemoryFactory";
import type { ExecuteRunPayload } from "../parsing/ExecuteRunPayloadSchema";
import { WorkspaceBootstrapService } from "../services/WorkspaceBootstrapService";
import { AIService } from "../../services/AIService";
import {
  ProviderConfigService,
  DurableProviderStore,
  readByokEncryptionKey,
} from "../../services/providers";
import type { DurableObjectState as LegacyDurableObjectState } from "@cloudflare/workers-types";
import type { RunEngineDependencies, IAgent } from "@shadowbox/execution-engine/runtime";
import { tagRuntimeStateSemantics } from "@shadowbox/execution-engine/runtime";

/**
 * Compose complete runtime with boundary ports.
 *
 * This factory:
 * 1. Creates infrastructure adapters (Cloudflare-backed ports)
 * 2. Builds domain services (AIService, ProviderConfigService, etc.)
 * 3. Assembles RunEngineDependencies for orchestration
 *
 * The result is a runtime that depends on ports, not platform specifics.
 *
 * @param ctx - Durable Object context
 * @param env - Cloudflare environment
 * @param payload - Execute run payload
 * @param options - Composition options
 * @returns { agent, runEngineDeps, ports }
 */
export function composeRuntime(
  ctx: unknown,
  env: Env,
  payload: ExecuteRunPayload,
  options: { strict?: boolean } = {},
): {
  agent: IAgent | undefined;
  runEngineDeps: RunEngineDependencies;
  ports: RuntimePorts;
} {
  // 1. Build pricing/budgeting (platform-agnostic domain logic)
  const budgetingComponents = buildPricingAndBudgeting(ctx, env);

  // 2. Build provider services
  const runtimeState = tagRuntimeStateSemantics(
    ctx as unknown as LegacyDurableObjectState,
    "do",
  );
  const durableProviderStore = new DurableProviderStore(
    ctx as unknown as LegacyDurableObjectState,
    {
      runId: payload.runId,
      userId: payload.userId,
      workspaceId: payload.workspaceId,
    },
    resolveProviderEncryptionKey(env),
  );
  const providerConfigService = new ProviderConfigService(
    env,
    durableProviderStore,
  );
  const aiService = new AIService(env, providerConfigService);

  // 3. Create runtime ports (infrastructure adapters)
  const ports = createRuntimePorts(ctx, env, aiService, providerConfigService);

  // 4. Build LLM gateway using provider services
  const { llmRuntimeService, llmGateway } = buildLLMGateway(
    ctx,
    env,
    {
      runId: payload.runId,
      userId: payload.userId,
      workspaceId: payload.workspaceId,
    },
    budgetingComponents,
  );

  // 5. Resolve agent
  const agent = resolveAgent(
    env,
    llmGateway,
    payload.sessionId,
    payload.runId,
    payload.userId,
    payload.input.agentType,
    {
      strict: options.strict ?? true,
      correlationId: payload.correlationId,
    },
  );

  // 6. Build session memory and workspace bootstrapper
  const sessionMemoryClient = buildSessionMemoryClient(env, payload.sessionId);
  const workspaceBootstrapper = WorkspaceBootstrapService.fromEnv(
    env,
    payload.sessionId,
    payload.runId,
    payload.userId,
  );

  // 7. Assemble final dependencies
  const {
    pricingRegistry,
    costLedger,
    costTracker,
    budgetManager,
    pricingResolver,
  } = budgetingComponents;

  const runEngineDeps: RunEngineDependencies = {
    aiService: llmRuntimeService,
    llmGateway,
    costLedger,
    costTracker,
    pricingRegistry,
    pricingResolver,
    budgetManager,
    sessionMemoryClient,
    workspaceBootstrapper,
  };

  return {
    agent,
    runEngineDeps,
    ports,
  };
}

/**
 * Resolve provider encryption key with error handling.
 */
function resolveProviderEncryptionKey(env: Env): string {
  const key = readByokEncryptionKey(env);
  if (!key) {
    throw new Error(
      "Missing dedicated BYOK credential encryption key (BYOK_CREDENTIAL_ENCRYPTION_KEY)",
    );
  }
  return key;
}
