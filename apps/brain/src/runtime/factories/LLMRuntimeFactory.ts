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
} from "@shadowbox/execution-engine/runtime";
import {
  LLMGateway as LLMGatewayImpl,
  PricingRegistry,
  PricingResolver,
  CostLedger,
  CostTracker,
  BudgetManager,
} from "@shadowbox/execution-engine/runtime";

/**
 * Build LLM gateway and AI service for runtime execution.
 *
 * @param ctx - Durable Object state context
 * @param env - Cloudflare environment
 * @param runId - Run ID for provider store scoping
 * @returns { llmRuntimeService, llmGateway }
 * @throws Error if provider validation fails
 */
export function buildLLMGateway(
  ctx: unknown,
  env: Env,
  runId: string,
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

  const pricingRegistry = new PricingRegistry(undefined, {
    failOnUnseededPricing: env.COST_FAIL_ON_UNSEEDED_PRICING === "true",
  });

  const pricingResolver = new PricingResolver(pricingRegistry, {
    unknownPricingMode: getUnknownPricingMode(env),
  });

  const costLedger = new CostLedger(
    ctx as unknown as LegacyDurableObjectState,
  );

  const costTracker = new CostTracker(
    ctx as unknown as LegacyDurableObjectState,
    pricingRegistry,
    getUnknownPricingMode(env),
  );

  const budgetManager = new BudgetManager(
    costTracker,
    pricingRegistry,
    getBudgetConfig(env),
    ctx as unknown as LegacyDurableObjectState,
  );

  const llmGateway = new LLMGatewayImpl({
    aiService: llmRuntimeService,
    budgetPolicy: budgetManager,
    costLedger,
    pricingResolver,
  });

  return { llmRuntimeService, llmGateway };
}

/**
 * Get unknown pricing mode from environment.
 * Defaults to "warn" if not configured or invalid.
 */
function getUnknownPricingMode(env: Env): "warn" | "block" {
  const mode = env.COST_UNKNOWN_PRICING_MODE;
  if (mode === "block" || mode === "warn") {
    return mode;
  }
  return "warn";
}

/**
 * Parse budget configuration from environment.
 */
function getBudgetConfig(env: Env): {
  maxCostPerRun?: number;
  maxCostPerSession?: number;
} {
  const parseBudget = (value: string | undefined): number | undefined => {
    if (!value) return undefined;
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed)) {
      console.warn(`[runtime/llm-factory] Invalid budget value: ${value}`);
      return undefined;
    }
    return parsed;
  };

  return {
    maxCostPerRun: parseBudget(env.MAX_RUN_BUDGET),
    maxCostPerSession: parseBudget(env.MAX_SESSION_BUDGET),
  };
}
