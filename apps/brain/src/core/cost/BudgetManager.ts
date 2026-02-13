// apps/brain/src/core/cost/BudgetManager.ts
// Phase 3.1: Budget enforcement for cost control

import type { ICostTracker } from "./CostTracker";
import type { BudgetConfig, BudgetCheckResult, LLMUsage } from "./types";
import { DEFAULT_BUDGET } from "./types";

export interface IBudgetManager {
  checkBudget(
    runId: string,
    estimatedUsage: LLMUsage,
  ): Promise<BudgetCheckResult>;
  getRemainingBudget(runId: string): Promise<number>;
  isOverBudget(runId: string): Promise<boolean>;
}

/**
 * BudgetManager - Enforces cost limits per run
 *
 * Design principles:
 * 1. Check budget BEFORE each LLM call (fail fast)
 * 2. Use estimated costs based on token limits
 * 3. Record actual costs after call completes
 * 4. Allow warning at threshold, block at limit
 */
export class BudgetManager implements IBudgetManager {
  private config: BudgetConfig;

  constructor(
    private costTracker: ICostTracker,
    config?: Partial<BudgetConfig>,
  ) {
    this.config = { ...DEFAULT_BUDGET, ...config };
  }

  /**
   * Check if an LLM call is within budget
   * Called by RunEngine BEFORE each LLM call
   */
  async checkBudget(
    runId: string,
    estimatedUsage: LLMUsage,
  ): Promise<BudgetCheckResult> {
    const currentCost = await this.costTracker.getCurrentCost(runId);

    // Calculate estimated cost for this call
    // Use the estimated cost from usage if provided, otherwise use pricing registry
    const estimatedCallCost =
      estimatedUsage.cost ?? this.estimateCost(estimatedUsage);
    const projectedCost = currentCost + estimatedCallCost;
    const remainingBudget = this.config.maxCostPerRun - currentCost;

    // Check if over budget
    if (projectedCost > this.config.maxCostPerRun) {
      console.warn(
        `[cost/budget] Budget exceeded for run ${runId}. ` +
          `Current: $${currentCost.toFixed(4)}, ` +
          `Projected: $${projectedCost.toFixed(4)}, ` +
          `Limit: $${this.config.maxCostPerRun.toFixed(2)}`,
      );

      return {
        allowed: false,
        currentCost,
        projectedCost,
        remainingBudget,
        reason: `Budget limit exceeded: $${projectedCost.toFixed(4)} > $${this.config.maxCostPerRun.toFixed(2)}`,
      };
    }

    // Check if at warning threshold
    const usageRatio = currentCost / this.config.maxCostPerRun;
    if (usageRatio >= this.config.warningThreshold) {
      console.warn(
        `[cost/budget] Budget warning for run ${runId}: ` +
          `${(usageRatio * 100).toFixed(1)}% used ` +
          `($${currentCost.toFixed(4)} / $${this.config.maxCostPerRun.toFixed(2)})`,
      );
    }

    console.log(
      `[cost/budget] Budget check passed for run ${runId}. ` +
        `Current: $${currentCost.toFixed(4)}, ` +
        `Estimated: $${estimatedCallCost.toFixed(4)}, ` +
        `Remaining: $${remainingBudget.toFixed(4)}`,
    );

    return {
      allowed: true,
      currentCost,
      projectedCost,
      remainingBudget,
    };
  }

  /**
   * Get remaining budget for a run
   */
  async getRemainingBudget(runId: string): Promise<number> {
    const currentCost = await this.costTracker.getCurrentCost(runId);
    return Math.max(0, this.config.maxCostPerRun - currentCost);
  }

  /**
   * Check if run is over budget
   */
  async isOverBudget(runId: string): Promise<boolean> {
    const currentCost = await this.costTracker.getCurrentCost(runId);
    return currentCost >= this.config.maxCostPerRun;
  }

  /**
   * Get current budget configuration
   */
  getConfig(): BudgetConfig {
    return { ...this.config };
  }

  /**
   * Update budget configuration
   */
  updateConfig(config: Partial<BudgetConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Simple cost estimation based on token counts
   * Conservative estimate assuming GPT-4o pricing
   */
  private estimateCost(usage: LLMUsage): number {
    // Conservative estimate using GPT-4o rates as baseline
    const inputRate = 0.005; // $0.005 per 1K tokens
    const outputRate = 0.015; // $0.015 per 1K tokens

    const inputCost = (usage.promptTokens / 1000) * inputRate;
    const outputCost = (usage.completionTokens / 1000) * outputRate;

    return inputCost + outputCost;
  }
}

export class BudgetExceededError extends Error {
  constructor(
    public readonly runId: string,
    public readonly currentCost: number,
    public readonly limit: number,
  ) {
    super(
      `[cost/budget] Budget exceeded for run ${runId}: ` +
        `$${currentCost.toFixed(4)} > $${limit.toFixed(2)}`,
    );
    this.name = "BudgetExceededError";
  }
}
