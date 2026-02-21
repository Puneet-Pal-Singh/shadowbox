/**
 * LLMRuntimeFactory - Build LLM runtime dependencies.
 *
 * Single Responsibility: Create LLM gateway and related services.
 * Encapsulates provider validation, AI service setup, and LLM gateway construction.
 */

import type { DurableObjectState as LegacyDurableObjectState } from "@cloudflare/workers-types";
import type { Env } from "../../types/ai";
import { AIService } from "../../services/AIService";
import {
  ProviderConfigService,
  getProviderCapabilityFlags,
  isModelAllowedByCapabilityMatrix,
} from "../../services/providers";
import { ProviderValidationService } from "../../services/ProviderValidationService";
import { DurableProviderStore } from "../../services/providers/DurableProviderStore";
import type { ProviderStoreScopeInput } from "../../services/providers/provider-scope";
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
 * @param providerScope - Scope for provider credential store keying
 * @param budgetingComponents - Pre-built pricing/budgeting components from BudgetingFactory
 * @returns { llmRuntimeService, llmGateway }
 * @throws Error if provider validation fails
 */
export function buildLLMGateway(
  ctx: unknown,
  env: Env,
  providerScope: ProviderStoreScopeInput,
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
    providerScope,
    resolveProviderEncryptionKey(env),
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
    providerCapabilityResolver: {
      getCapabilities: (providerId: string) => {
        if (
          providerId !== "openrouter" &&
          providerId !== "openai" &&
          providerId !== "groq"
        ) {
          return undefined;
        }
        return getProviderCapabilityFlags(providerId);
      },
      isModelAllowed: (providerId: string, modelId: string) => {
        if (
          providerId !== "openrouter" &&
          providerId !== "openai" &&
          providerId !== "groq"
        ) {
          return false;
        }
        return isModelAllowedByCapabilityMatrix(providerId, modelId);
      },
    },
  });

  return { llmRuntimeService, llmGateway };
}

function resolveProviderEncryptionKey(env: Env): string {
  const key =
    env.BYOK_CREDENTIAL_ENCRYPTION_KEY ?? env.GITHUB_TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "Missing provider credential encryption key (BYOK_CREDENTIAL_ENCRYPTION_KEY)",
    );
  }
  return key;
}
