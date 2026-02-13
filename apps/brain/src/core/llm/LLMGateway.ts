import type { CoreMessage } from "ai";
import type { AIService } from "../../services/AIService";
import type { BudgetPolicy } from "../cost/BudgetManager";
import type { CostEvent, LLMUsage } from "../cost/types";
import type { ICostLedger } from "../cost/CostLedger";
import type { IPricingResolver } from "../cost/PricingResolver";
import type {
  ILLMGateway,
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

    const result = await this.deps.aiService.generateText({
      messages: req.messages,
      model: req.model,
      temperature: req.temperature,
      system: req.system,
    });

    const usage = this.normalizeUsage(result.usage, req.model);
    await this.persistCostEvent(req, usage);

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

    const result = await this.deps.aiService.generateStructured({
      messages: req.messages,
      schema: req.schema,
      model: req.model,
      temperature: req.temperature,
    });

    const usage = this.normalizeUsage(result.usage, req.model);
    await this.persistCostEvent(req, usage);

    return {
      object: result.object,
      usage,
    };
  }

  async generateStream(req: LLMTextRequest): Promise<ReadableStream<Uint8Array>> {
    const estimatedUsage = this.estimateUsage(req.messages, req.model);
    await this.preflight(req, estimatedUsage);

    return this.deps.aiService.createChatStream({
      messages: req.messages,
      system: req.system,
      tools: req.tools,
      model: req.model,
      temperature: req.temperature,
      onFinish: async (finalResult) => {
        const usage = this.normalizeUsage(finalResult.usage, req.model);
        await this.persistCostEvent(req, usage);
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

    const event: CostEvent = {
      eventId: crypto.randomUUID(),
      idempotencyKey: req.context.idempotencyKey ?? crypto.randomUUID(),
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

    await this.deps.costLedger.append(event);
    await this.deps.budgetPolicy.postCommit(
      req.context,
      resolved.calculatedCostUsd,
    );

    if (resolved.shouldBlock) {
      throw new UnknownPricingError(usage.provider, usage.model);
    }
  }
}

export class UnknownPricingError extends Error {
  constructor(provider: string, model: string) {
    super(
      `[llm/gateway] Unknown pricing policy blocked execution for ${provider}:${model}`,
    );
    this.name = "UnknownPricingError";
  }
}
