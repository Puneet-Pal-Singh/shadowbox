// apps/brain/src/core/cost/CostTracker.ts
// Phase 3A: Cost tracking per run with model-based rates

import type { DurableObjectState } from "@cloudflare/workers-types";
import type { TokenUsage, CostSnapshot, ModelCost } from "../../types";

export interface ICostTracker {
  recordUsage(runId: string, usage: TokenUsage): Promise<void>;
  getCostSnapshot(runId: string): Promise<CostSnapshot>;
  estimateCost(
    model: string,
    promptTokens: number,
    completionTokens: number,
  ): number;
  getTotalCostForSession(sessionId: string): Promise<number>;
}

export class CostTracker implements ICostTracker {
  private readonly COST_KEY_PREFIX = "cost:";
  private readonly SESSION_COST_KEY_PREFIX = "session_cost:";

  // Cost per 1K tokens in USD
  private readonly MODEL_RATES: Record<
    string,
    { prompt: number; completion: number }
  > = {
    "gpt-4": { prompt: 0.03, completion: 0.06 },
    "gpt-4-turbo": { prompt: 0.01, completion: 0.03 },
    "gpt-4o": { prompt: 0.005, completion: 0.015 },
    "gpt-3.5-turbo": { prompt: 0.0015, completion: 0.002 },
    "llama-3.3-70b-versatile": { prompt: 0.00059, completion: 0.00079 },
    "llama-3.1-8b-instant": { prompt: 0.0001, completion: 0.0001 },
    default: { prompt: 0.001, completion: 0.002 },
  };

  constructor(private ctx: DurableObjectState) {}

  private getCostKey(runId: string): string {
    return `${this.COST_KEY_PREFIX}${runId}`;
  }

  private getSessionCostKey(sessionId: string): string {
    return `${this.SESSION_COST_KEY_PREFIX}${sessionId}`;
  }

  async recordUsage(runId: string, usage: TokenUsage): Promise<void> {
    const costKey = this.getCostKey(runId);

    await this.ctx.blockConcurrencyWhile(async () => {
      const current =
        (await this.ctx.storage.get<CostSnapshot>(costKey)) ||
        this.createEmptySnapshot(runId);
      const cost = this.calculateCost(usage);

      const updated: CostSnapshot = {
        ...current,
        totalCost: current.totalCost + cost,
        totalTokens:
          current.totalTokens + usage.promptTokens + usage.completionTokens,
        byModel: this.updateModelCost(
          current.byModel,
          usage.model,
          usage,
          cost,
        ),
      };

      await this.ctx.storage.put(costKey, updated);
    });

    console.log(
      `[cost/tracker] Recorded usage for run ${runId}: ${usage.model}`,
    );
  }

  async getCostSnapshot(runId: string): Promise<CostSnapshot> {
    const costKey = this.getCostKey(runId);
    const snapshot = await this.ctx.storage.get<CostSnapshot>(costKey);
    return snapshot || this.createEmptySnapshot(runId);
  }

  estimateCost(
    model: string,
    promptTokens: number,
    completionTokens: number,
  ): number {
    const rates = this.MODEL_RATES[model] ?? this.MODEL_RATES["default"];
    if (!rates) {
      return 0;
    }
    const promptCost = (promptTokens / 1000) * rates.prompt;
    const completionCost = (completionTokens / 1000) * rates.completion;
    return promptCost + completionCost;
  }

  async getTotalCostForSession(sessionId: string): Promise<number> {
    const sessionCostKey = this.getSessionCostKey(sessionId);
    const cached = await this.ctx.storage.get<number>(sessionCostKey);
    return cached || 0;
  }

  async updateSessionCost(sessionId: string, runCost: number): Promise<void> {
    const sessionCostKey = this.getSessionCostKey(sessionId);

    await this.ctx.blockConcurrencyWhile(async () => {
      const current = (await this.ctx.storage.get<number>(sessionCostKey)) || 0;
      await this.ctx.storage.put(sessionCostKey, current + runCost);
    });
  }

  private createEmptySnapshot(runId: string): CostSnapshot {
    return {
      runId,
      totalCost: 0,
      totalTokens: 0,
      byModel: {},
    };
  }

  private calculateCost(usage: TokenUsage): number {
    return this.estimateCost(
      usage.model,
      usage.promptTokens,
      usage.completionTokens,
    );
  }

  private updateModelCost(
    existing: Record<string, ModelCost>,
    model: string,
    usage: TokenUsage,
    cost: number,
  ): Record<string, ModelCost> {
    const current = existing[model] || {
      model,
      promptTokens: 0,
      completionTokens: 0,
      cost: 0,
    };

    return {
      ...existing,
      [model]: {
        model,
        promptTokens: current.promptTokens + usage.promptTokens,
        completionTokens: current.completionTokens + usage.completionTokens,
        cost: current.cost + cost,
      },
    };
  }
}

export class CostTrackingError extends Error {
  constructor(message: string) {
    super(`[cost/tracker] ${message}`);
    this.name = "CostTrackingError";
  }
}
