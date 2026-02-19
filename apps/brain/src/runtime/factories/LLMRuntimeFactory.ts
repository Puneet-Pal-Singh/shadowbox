/**
 * LLMRuntimeFactory - Build LLM runtime dependencies.
 *
 * Single Responsibility: Create LLM gateway and related services.
 * Encapsulates provider validation, AI service setup, and LLM gateway construction.
 */

import type { DurableObjectState as LegacyDurableObjectState } from "@cloudflare/workers-types";
import type { Env } from "../../types/ai";
import { AIService } from "../../services/AIService";
import { ProviderConfigService } from "../../services/ProviderConfigService";
import { ProviderValidationService } from "../../services/ProviderValidationService";
import { DurableProviderStore } from "../../services/providers/DurableProviderStore";
import type {
  LLMRuntimeAIService,
  LLMGateway,
  PricingRegistry,
  PricingResolver,
  CostLedger,
  CostTracker,
  BudgetManager,
} from "@shadowbox/execution-engine/runtime";
import { LLMGateway as LLMGatewayImpl } from "@shadowbox/execution-engine/runtime";

/**
 * Build LLM gateway and AI service for runtime execution.
 *
 * @param ctx - Durable Object state context
 * @param env - Cloudflare environment
 * @param runId - Run ID for provider store scoping
 * @param budgetingComponents - Pre-built pricing/budgeting components from BudgetingFactory
 * @returns { llmRuntimeService, llmGateway }
 * @throws Error if provider validation fails
 */
export function buildLLMGateway(
  ctx: unknown,
  env: Env,
  runId: string,
  budgetingComponents: {
    pricingRegistry: PricingRegistry;
    costLedger: CostLedger;
    costTracker: CostTracker;
    budgetManager: BudgetManager;
    pricingResolver: PricingResolver;
  },
): {
  llmRuntimeService: LLMRuntimeAIService;
  llmGateway: LLMGateway;
} {
  // Preflight validation: fail fast with actionable errors
  const validationResult = ProviderValidationService.validate(env);
  if (!validationResult.valid) {
    const errorMessage = ProviderValidationService.formatErrors(
      validationResult,
    );
    console.error("[runtime/llm-factory] Provider validation failed:\n" + errorMessage);
    throw new Error(
      "Provider configuration validation failed. Check logs for details.",
    );
  }

  // Log warnings (optional, non-blocking)
  if (validationResult.warnings.length > 0) {
    console.warn(
      "[runtime/llm-factory] Provider warnings:\n" +
        validationResult.warnings
          .map((w) => `⚠ [${w.code}] ${w.message}`)
          .join("\n"),
    );
  }

  // Create durable provider store scoped to runId for cross-isolate state persistence
  const durableProviderStore = new DurableProviderStore(
    ctx as unknown as LegacyDurableObjectState,
    runId,
  );

  const providerConfigService = new ProviderConfigService(
    env,
    durableProviderStore,
  );
  const aiService = new AIService(env, providerConfigService);

  const llmRuntimeService: LLMRuntimeAIService = {
    getProvider: () => aiService.getProvider(),
    getDefaultModel: () => aiService.getDefaultModel(),
    generateText: (input) => aiService.generateText(input),
    generateStructured: (input) => aiService.generateStructured(input),
    createChatStream: (input) => aiService.createChatStream(input),
  };

  // Use pre-built budgeting components to ensure unified cost tracking
  const llmGateway = new LLMGatewayImpl({
    aiService: llmRuntimeService,
    budgetPolicy: budgetingComponents.budgetManager,
    costLedger: budgetingComponents.costLedger,
    pricingResolver: budgetingComponents.pricingResolver,
  });

  return { llmRuntimeService, llmGateway };
}
