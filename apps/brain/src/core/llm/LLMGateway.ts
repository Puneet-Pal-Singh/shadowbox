import type { CoreMessage } from "ai";
import type { AIService } from "../../services/AIService";
import type { BudgetPolicy } from "../cost/BudgetManager";
import type { CostEvent, LLMUsage } from "../cost/types";
import type { ICostLedger } from "../cost/CostLedger";
import type { IPricingResolver } from "../cost/PricingResolver";
import type {
  ILLMGateway,
  LLMCallContext,
  LLMTextRequest,
  LLMTextResponse,
  LLMStructuredRequest,
  LLMStructuredResponse,
} from "./types";

const TOKEN_CHAR_RATIO = 4;
const DEFAULT_COMPLETION_TOKENS = 500;

export interface LLMGatewayDependencies {
  aiService: AIService;
  budgetPolicy: BudgetPolicy;
  costLedger: ICostLedger;
  pricingResolver: IPricingResolver;
}

export class LLMGateway implements ILLMGateway {
  constructor(private deps: LLMGatewayDependencies) {}

  async generateText(req: LLMTextRequest): Promise<LLMTextResponse> {
    const estimatedUsage = this.estimateUsage(req.messages, req.model);
    await this.preflight(req, estimatedUsage);
    this.assertPricingAllowed(req.context, estimatedUsage);
    const requestWithIdempotency = this.withIdempotencyKey(
      req,
      req.context.idempotencyKey ??
        this.createIdempotencyKey(req.context, estimatedUsage),
    );

    const result = await this.deps.aiService.generateText({
      messages: req.messages,
      model: req.model,
      temperature: req.temperature,
      system: req.system,
    });

    const usage = this.normalizeUsage(result.usage, req.model);
    await this.persistCostEvent(requestWithIdempotency, usage);

    return {
      text: result.text,
      usage,
    };
  }

  async generateStructured<T>(
    req: LLMStructuredRequest<T>,
  ): Promise<LLMStructuredResponse<T>> {
    const estimatedUsage = this.estimateUsage(req.messages, req.model);
    await this.preflight(req, estimatedUsage);
    this.assertPricingAllowed(req.context, estimatedUsage);
    const requestWithIdempotency = this.withIdempotencyKey(
      req,
      req.context.idempotencyKey ??
        this.createIdempotencyKey(req.context, estimatedUsage),
    );

    const result = await this.deps.aiService.generateStructured({
      messages: req.messages,
      schema: req.schema,
      model: req.model,
      temperature: req.temperature,
    });

    const usage = this.normalizeUsage(result.usage, req.model);
    await this.persistCostEvent(requestWithIdempotency, usage);

    return {
      object: result.object,
      usage,
    };
  }

  async generateStream(req: LLMTextRequest): Promise<ReadableStream<Uint8Array>> {
    const estimatedUsage = this.estimateUsage(req.messages, req.model);
    await this.preflight(req, estimatedUsage);
    this.assertPricingAllowed(req.context, estimatedUsage);
    const requestWithIdempotency = this.withIdempotencyKey(
      req,
      req.context.idempotencyKey ??
        this.createIdempotencyKey(req.context, estimatedUsage),
    );
    let didPersistCost = false;
    let persistPromise: Promise<void> | null = null;
    const persistOnce = async (usage: LLMUsage): Promise<void> => {
      if (didPersistCost) {
        return;
      }
      if (!persistPromise) {
        persistPromise = this.persistCostEvent(requestWithIdempotency, usage)
          .then(() => {
            didPersistCost = true;
          })
          .finally(() => {
            persistPromise = null;
          });
      }
      await persistPromise;
    };

    const upstream = await this.deps.aiService.createChatStream({
      messages: req.messages,
      system: req.system,
      tools: req.tools,
      model: req.model,
      temperature: req.temperature,
      onFinish: async (finalResult) => {
        const usage = this.normalizeUsage(finalResult.usage, req.model);
        await persistOnce(usage);
      },
    });

    const reader = upstream.getReader();
    return new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        try {
          const chunk = await reader.read();
          if (chunk.done) {
            if (!didPersistCost) {
              await persistOnce(estimatedUsage);
            }
            controller.close();
            return;
          }
          if (chunk.value) {
            controller.enqueue(chunk.value);
          }
        } catch (error) {
          if (!didPersistCost) {
            try {
              await persistOnce(estimatedUsage);
            } catch (persistError) {
              console.error(
                "[llm/gateway] failed to persist fallback stream cost after read error",
                persistError,
              );
            }
          }
          controller.error(error);
        }
      },
      cancel: async (reason) => {
        try {
          await reader.cancel(reason);
        } finally {
          if (!didPersistCost) {
            try {
              await persistOnce(estimatedUsage);
            } catch (persistError) {
              console.error(
                "[llm/gateway] failed to persist fallback stream cost after cancellation",
                persistError,
              );
            }
          }
        }
      },
    });
  }

  private async preflight(
    req: LLMTextRequest | LLMStructuredRequest<unknown>,
    usage: LLMUsage,
  ): Promise<void> {
    console.log(
      `[llm/gateway] preflight phase=${req.context.phase} run=${req.context.runId}`,
    );
    await this.deps.budgetPolicy.preflight(req.context, usage);
  }

  private estimateUsage(messages: CoreMessage[], model?: string): LLMUsage {
    const charCount = messages.reduce((sum, message) => {
      return sum + this.getMessageLength(message.content);
    }, 0);
    const promptTokens = Math.ceil(charCount / TOKEN_CHAR_RATIO);
    const completionTokens = DEFAULT_COMPLETION_TOKENS;

    return {
      provider: this.deps.aiService.getProvider(),
      model: model ?? this.deps.aiService.getDefaultModel(),
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }

  private getMessageLength(content: CoreMessage["content"]): number {
    if (typeof content === "string") {
      return content.length;
    }
    return JSON.stringify(content).length;
  }

  private normalizeUsage(usage: LLMUsage, model?: string): LLMUsage {
    const promptTokens = Math.max(0, usage.promptTokens ?? 0);
    const completionTokens = Math.max(0, usage.completionTokens ?? 0);
    const totalTokens =
      usage.totalTokens && usage.totalTokens > 0
        ? usage.totalTokens
        : promptTokens + completionTokens;

    return {
      ...usage,
      provider: usage.provider || this.deps.aiService.getProvider(),
      model: usage.model || model || this.deps.aiService.getDefaultModel(),
      promptTokens,
      completionTokens,
      totalTokens,
    };
  }

  private async persistCostEvent(
    req: LLMTextRequest | LLMStructuredRequest<unknown>,
    usage: LLMUsage,
  ): Promise<void> {
    const resolved = this.deps.pricingResolver.resolve(usage, usage.raw);
    const idempotencyKey =
      req.context.idempotencyKey ?? this.createIdempotencyKey(req.context, usage);

    const event: CostEvent = {
      eventId: crypto.randomUUID(),
      idempotencyKey,
      runId: req.context.runId,
      sessionId: req.context.sessionId,
      taskId: req.context.taskId,
      agentType: req.context.agentType,
      phase: req.context.phase,
      provider: usage.provider,
      model: usage.model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      providerCostUsd: resolved.providerCostUsd,
      calculatedCostUsd: resolved.calculatedCostUsd,
      pricingSource: resolved.pricingSource,
      createdAt: new Date().toISOString(),
    };

    const appended = await this.deps.costLedger.append(event);
    if (appended) {
      await this.deps.budgetPolicy.postCommit(
        req.context,
        resolved.calculatedCostUsd,
      );
    }
    if (resolved.shouldBlock) {
      console.warn(
        `[llm/gateway] unknown pricing persisted post-call for ${usage.provider}:${usage.model}`,
      );
    }
  }

  private assertPricingAllowed(context: LLMCallContext, usage: LLMUsage): void {
    const resolved = this.deps.pricingResolver.resolve(usage, usage.raw);
    if (resolved.shouldBlock) {
      throw new UnknownPricingError(usage.provider, usage.model, context.phase);
    }
  }

  private withIdempotencyKey<T extends LLMTextRequest | LLMStructuredRequest<unknown>>(
    req: T,
    idempotencyKey: string,
  ): T {
    return {
      ...req,
      context: {
        ...req.context,
        idempotencyKey,
      },
    };
  }

  private createIdempotencyKey(
    context: LLMCallContext,
    usage: LLMUsage,
  ): string {
    return [
      "llm",
      context.runId,
      context.sessionId,
      context.phase,
      context.taskId ?? "none",
      usage.provider,
      usage.model,
      usage.promptTokens.toString(),
      usage.completionTokens.toString(),
      usage.totalTokens.toString(),
    ].join(":");
  }
}

export class UnknownPricingError extends Error {
  constructor(provider: string, model: string, phase: string) {
    super(
      `[llm/gateway] Unknown pricing policy blocked execution for ${provider}:${model} in phase ${phase}`,
    );
    this.name = "UnknownPricingError";
  }
}
