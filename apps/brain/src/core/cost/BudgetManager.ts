// apps/brain/src/core/cost/BudgetManager.ts
// Phase 3.1: Budget enforcement for cost control

import type { ICostTracker } from "./CostTracker";
import type { IPricingRegistry } from "./PricingRegistry";
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
 * 2. Use estimated costs based on PricingRegistry
 * 3. Record actual costs after call completes
 * 4. Allow warning at threshold, block at limit
 *
 * Note: PricingRegistry must be injected to avoid hardcoding rates.
 * The registry should be loaded from external configuration.
 */
export class BudgetManager implements IBudgetManager {
  private config: BudgetConfig;

  constructor(
    private costTracker: ICostTracker,
    private pricingRegistry: IPricingRegistry,
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

    // Calculate estimated cost for this call using PricingRegistry
    const estimatedCallCost = this.estimateCost(estimatedUsage);
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
   * Estimate cost using PricingRegistry
   * If no pricing found, returns 0 with warning logged by PricingRegistry
   */
  private estimateCost(usage: LLMUsage): number {
    // If usage already has cost from provider, use that
    if (usage.cost !== undefined && usage.cost > 0) {
      return usage.cost;
    }

    // Otherwise use PricingRegistry to calculate
    const calculated = this.pricingRegistry.calculateCost(usage);
    return calculated.totalCost;
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
