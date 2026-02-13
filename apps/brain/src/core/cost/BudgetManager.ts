// apps/brain/src/core/cost/BudgetManager.ts
// Phase 3.1: Budget enforcement for cost control

import type { DurableObjectState } from "@cloudflare/workers-types";
import type { ICostTracker } from "./CostTracker";
import type { IPricingRegistry } from "./PricingRegistry";
import type { BudgetConfig, BudgetCheckResult, LLMUsage } from "./types";
import { DEFAULT_BUDGET } from "./types";
import type { LLMCallContext } from "../llm/types";

export interface IBudgetManager {
  checkBudget(
    runId: string,
    estimatedUsage: LLMUsage,
  ): Promise<BudgetCheckResult>;
  checkSessionBudget(
    sessionId: string,
    estimatedUsage: LLMUsage,
  ): Promise<BudgetCheckResult>;
  getRemainingBudget(runId: string): Promise<number>;
  getRemainingSessionBudget(sessionId: string): Promise<number>;
  isOverBudget(runId: string): Promise<boolean>;
  isOverSessionBudget(sessionId: string): Promise<boolean>;
  startSession(sessionId: string): Promise<void>;
  endSession(sessionId: string): Promise<void>;
  loadSessionCosts(): Promise<void>;
}

export interface BudgetPolicy {
  preflight(context: LLMCallContext, estimatedUsage: LLMUsage): Promise<void>;
  postCommit(context: LLMCallContext, actualCostUsd: number): Promise<void>;
}

/**
 * BudgetManager - Enforces cost limits per run and per session
 *
 * Design principles:
 * 1. Check budget BEFORE each LLM call (fail fast)
 * 2. Use PricingRegistry for cost estimation
 * 3. Record actual costs after call completes
 * 4. Allow warning at threshold, block at limit
 * 5. Enforce both per-run and per-session limits
 *
 * Note: PricingRegistry must be injected to avoid hardcoding rates.
 * The registry should be loaded from external configuration.
 */
const SESSION_COSTS_KEY = "session:costs";

export class BudgetManager implements IBudgetManager, BudgetPolicy {
  private config: BudgetConfig;
  private sessionCosts: Map<string, number> = new Map();
  private storage?: DurableObjectState;

  constructor(
    private costTracker: ICostTracker,
    private pricingRegistry: IPricingRegistry,
    config?: Partial<BudgetConfig>,
    storage?: DurableObjectState,
  ) {
    this.config = { ...DEFAULT_BUDGET, ...config };
    this.storage = storage;
    this.validateConfig();
  }

  async loadSessionCosts(): Promise<void> {
    if (!this.storage) {
      console.log(
        "[cost/budget] No storage available, using in-memory session costs",
      );
      return;
    }

    const savedCosts =
      await this.storage.storage.get<Record<string, number>>(SESSION_COSTS_KEY);
    if (savedCosts) {
      this.sessionCosts = new Map(Object.entries(savedCosts));
      console.log(
        `[cost/budget] Loaded ${this.sessionCosts.size} session costs from storage`,
      );
    }
  }

  private async persistSessionCosts(): Promise<void> {
    if (!this.storage) {
      return;
    }

    const costsObj = Object.fromEntries(this.sessionCosts);
    await this.storage.storage.put(SESSION_COSTS_KEY, costsObj);
  }

  /**
   * Validate configuration on construction
   * Note: Values of 0 mean "unlimited" and are allowed
   */
  private validateConfig(): void {
    if (
      this.config.maxCostPerRun !== undefined &&
      this.config.maxCostPerRun < 0
    ) {
      throw new Error(
        `[cost/budget] Invalid maxCostPerRun: must be non-negative, got ${this.config.maxCostPerRun}`,
      );
    }
    if (
      this.config.maxCostPerSession !== undefined &&
      this.config.maxCostPerSession < 0
    ) {
      throw new Error(
        `[cost/budget] Invalid maxCostPerSession: must be non-negative, got ${this.config.maxCostPerSession}`,
      );
    }
    if (this.config.warningThreshold !== undefined) {
      if (
        this.config.warningThreshold < 0 ||
        this.config.warningThreshold > 1
      ) {
        throw new Error(
          `[cost/budget] Invalid warningThreshold: must be between 0 and 1, got ${this.config.warningThreshold}`,
        );
      }
    }
  }

  /**
   * Check if an LLM call is within run budget
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

    // Handle unlimited budget (maxCostPerRun <= 0 means no limit)
    const hasRunLimit = this.config.maxCostPerRun > 0;
    const runLimit = hasRunLimit ? this.config.maxCostPerRun : Infinity;
    const remainingBudget = hasRunLimit ? runLimit - currentCost : Infinity;

    // Check if over run budget (only if limit is set)
    if (hasRunLimit && projectedCost > runLimit) {
      console.warn(
        `[cost/budget] Run budget exceeded for run ${runId}. ` +
          `Current: $${currentCost.toFixed(4)}, ` +
          `Projected: $${projectedCost.toFixed(4)}, ` +
          `Limit: $${runLimit.toFixed(2)}`,
      );

      return {
        allowed: false,
        currentCost,
        projectedCost,
        remainingBudget,
        reason: `Run budget limit exceeded: $${projectedCost.toFixed(4)} > $${runLimit.toFixed(2)}`,
      };
    }

    // Check warning threshold (only if limit is set)
    if (hasRunLimit && this.config.warningThreshold > 0) {
      const usageRatio = currentCost / runLimit;
      if (usageRatio >= this.config.warningThreshold) {
        console.warn(
          `[cost/budget] Run budget warning for run ${runId}: ` +
            `${(usageRatio * 100).toFixed(1)}% used ` +
            `($${currentCost.toFixed(4)} / $${runLimit.toFixed(2)})`,
        );
      }
    }

    console.log(
      `[cost/budget] Run budget check passed for run ${runId}. ` +
        `Current: $${currentCost.toFixed(4)}, ` +
        `Estimated: $${estimatedCallCost.toFixed(4)}, ` +
        `Remaining: ${remainingBudget === Infinity ? "unlimited" : "$" + remainingBudget.toFixed(4)}`,
    );

    return {
      allowed: true,
      currentCost,
      projectedCost,
      remainingBudget,
    };
  }

  /**
   * Check if an LLM call is within session budget
   * Called by RunEngine BEFORE each LLM call for session-level enforcement
   */
  async checkSessionBudget(
    sessionId: string,
    estimatedUsage: LLMUsage,
  ): Promise<BudgetCheckResult> {
    const currentSessionCost = this.sessionCosts.get(sessionId) ?? 0;

    // Calculate estimated cost for this call using PricingRegistry
    const estimatedCallCost = this.estimateCost(estimatedUsage);
    const projectedSessionCost = currentSessionCost + estimatedCallCost;

    // Handle unlimited session budget (maxCostPerSession <= 0 or undefined means no limit)
    const hasSessionLimit = this.config.maxCostPerSession > 0;
    const sessionLimit = hasSessionLimit
      ? this.config.maxCostPerSession
      : Infinity;
    const sessionRemainingBudget = hasSessionLimit
      ? sessionLimit - currentSessionCost
      : Infinity;

    // Check if over session budget (only if limit is set)
    if (hasSessionLimit && projectedSessionCost > sessionLimit) {
      console.warn(
        `[cost/budget] Session budget exceeded for session ${sessionId}. ` +
          `Current: $${currentSessionCost.toFixed(4)}, ` +
          `Projected: $${projectedSessionCost.toFixed(4)}, ` +
          `Limit: $${sessionLimit.toFixed(2)}`,
      );

      return {
        allowed: false,
        currentCost: currentSessionCost,
        projectedCost: projectedSessionCost,
        remainingBudget: sessionRemainingBudget,
        sessionCost: currentSessionCost,
        sessionRemainingBudget,
        reason: `Session budget limit exceeded: $${projectedSessionCost.toFixed(4)} > $${sessionLimit.toFixed(2)}`,
      };
    }

    console.log(
      `[cost/budget] Session budget check passed for session ${sessionId}. ` +
        `Current: $${currentSessionCost.toFixed(4)}, ` +
        `Estimated: $${estimatedCallCost.toFixed(4)}, ` +
        `Remaining: ${sessionRemainingBudget === Infinity ? "unlimited" : "$" + sessionRemainingBudget.toFixed(4)}`,
    );

    return {
      allowed: true,
      currentCost: currentSessionCost,
      projectedCost: projectedSessionCost,
      remainingBudget: sessionRemainingBudget,
      sessionCost: currentSessionCost,
      sessionRemainingBudget,
    };
  }

  /**
   * Record actual cost after LLM call completes (session-level)
   */
  async recordSessionCost(
    sessionId: string,
    actualCost: number,
  ): Promise<void> {
    const currentCost = this.sessionCosts.get(sessionId) ?? 0;
    this.sessionCosts.set(sessionId, currentCost + actualCost);
    await this.persistSessionCosts();
    console.log(
      `[cost/budget] Recorded session cost for ${sessionId}: $${actualCost.toFixed(4)} (total: $${(currentCost + actualCost).toFixed(4)})`,
    );
  }

  /**
   * Get remaining budget for a run
   */
  async getRemainingBudget(runId: string): Promise<number> {
    const currentCost = await this.costTracker.getCurrentCost(runId);
    if (this.config.maxCostPerRun <= 0) {
      return Infinity;
    }
    return Math.max(0, this.config.maxCostPerRun - currentCost);
  }

  /**
   * Get remaining budget for a session
   */
  async getRemainingSessionBudget(sessionId: string): Promise<number> {
    const currentCost = this.sessionCosts.get(sessionId) ?? 0;
    if (this.config.maxCostPerSession <= 0) {
      return Infinity;
    }
    return Math.max(0, this.config.maxCostPerSession - currentCost);
  }

  /**
   * Check if run is over budget
   */
  async isOverBudget(runId: string): Promise<boolean> {
    const currentCost = await this.costTracker.getCurrentCost(runId);
    if (this.config.maxCostPerRun <= 0) {
      return false;
    }
    return currentCost >= this.config.maxCostPerRun;
  }

  /**
   * Check if session is over budget
   */
  async isOverSessionBudget(sessionId: string): Promise<boolean> {
    const currentCost = this.sessionCosts.get(sessionId) ?? 0;
    if (this.config.maxCostPerSession <= 0) {
      return false;
    }
    return currentCost >= this.config.maxCostPerSession;
  }

  /**
   * Start a new session (initializes session cost tracking)
   */
  async startSession(sessionId: string): Promise<void> {
    if (!this.sessionCosts.has(sessionId)) {
      this.sessionCosts.set(sessionId, 0);
      await this.persistSessionCosts();
      console.log(`[cost/budget] Started session ${sessionId}`);
    }
  }

  /**
   * End a session (clears session cost tracking)
   */
  async endSession(sessionId: string): Promise<void> {
    const cost = this.sessionCosts.get(sessionId) ?? 0;
    this.sessionCosts.delete(sessionId);
    await this.persistSessionCosts();
    console.log(
      `[cost/budget] Ended session ${sessionId} (total cost: $${cost.toFixed(4)})`,
    );
  }

  /**
   * Get current budget configuration
   */
  getConfig(): BudgetConfig {
    return { ...this.config };
  }

  /**
   * Update budget configuration with validation
   */
  updateConfig(config: Partial<BudgetConfig>): void {
    // Validate new values before applying (negative values are not allowed)
    if (config.maxCostPerRun !== undefined && config.maxCostPerRun < 0) {
      throw new Error(
        `[cost/budget] Invalid maxCostPerRun: must be non-negative, got ${config.maxCostPerRun}`,
      );
    }
    if (
      config.maxCostPerSession !== undefined &&
      config.maxCostPerSession < 0
    ) {
      throw new Error(
        `[cost/budget] Invalid maxCostPerSession: must be non-negative, got ${config.maxCostPerSession}`,
      );
    }
    if (config.warningThreshold !== undefined) {
      if (config.warningThreshold < 0 || config.warningThreshold > 1) {
        throw new Error(
          `[cost/budget] Invalid warningThreshold: must be between 0 and 1, got ${config.warningThreshold}`,
        );
      }
    }

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

  async preflight(
    context: LLMCallContext,
    estimatedUsage: LLMUsage,
  ): Promise<void> {
    const runCheck = await this.checkBudget(context.runId, estimatedUsage);
    if (!runCheck.allowed) {
      console.warn(
        `[budget/policy] deny scope=run run=${context.runId} reason=${runCheck.reason ?? "budget exceeded"}`,
      );
      throw new BudgetExceededError(
        context.runId,
        runCheck.projectedCost,
        this.config.maxCostPerRun,
      );
    }

    const sessionCheck = await this.checkSessionBudget(
      context.sessionId,
      estimatedUsage,
    );
    if (!sessionCheck.allowed) {
      console.warn(
        `[budget/policy] deny scope=session session=${context.sessionId} reason=${sessionCheck.reason ?? "budget exceeded"}`,
      );
      throw new SessionBudgetExceededError(
        context.sessionId,
        sessionCheck.projectedCost,
        this.config.maxCostPerSession,
      );
    }

    console.log(
      `[budget/policy] allow run=${context.runId} session=${context.sessionId} phase=${context.phase}`,
    );
  }

  async postCommit(
    context: LLMCallContext,
    actualCostUsd: number,
  ): Promise<void> {
    await this.recordSessionCost(context.sessionId, actualCostUsd);
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

export class SessionBudgetExceededError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly currentCost: number,
    public readonly limit: number,
  ) {
    super(
      `[cost/budget] Session budget exceeded for ${sessionId}: ` +
        `$${currentCost.toFixed(4)} > $${limit.toFixed(2)}`,
    );
    this.name = "SessionBudgetExceededError";
  }
}
