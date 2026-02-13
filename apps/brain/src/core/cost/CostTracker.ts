// apps/brain/src/core/cost/CostTracker.ts
// Phase 3.1: Upgraded cost tracking with append-only CostEvent storage

import type { DurableObjectState } from "@cloudflare/workers-types";
import type {
  LLMUsage,
  CostEvent,
  CostSnapshot,
  ModelCost,
  ProviderCost,
} from "./types";
import type { IPricingRegistry } from "./PricingRegistry";

export interface ICostTracker {
  recordLLMUsage(runId: string, usage: LLMUsage): Promise<void>;
  getCostEvents(runId: string): Promise<CostEvent[]>;
  aggregateRunCost(runId: string): Promise<CostSnapshot>;
  getCurrentCost(runId: string): Promise<number>;
}

/**
 * CostTracker - Append-only cost event storage
 *
 * Design principles:
 * 1. Never overwrite cost data - only append new events
 * 2. Aggregate on read (computed, not stored)
 * 3. Full audit trail via CostEvent log
 */
export class CostTracker implements ICostTracker {
  private readonly EVENTS_KEY_PREFIX = "run:";
  private readonly EVENTS_KEY_SUFFIX = ":cost:events";

  constructor(
    private storage: DurableObjectState,
    private pricingRegistry: IPricingRegistry,
  ) {}

  /**
   * Record LLM usage as append-only CostEvent
   * Called by RunEngine after each LLM call
   *
   * Never overwrites - always appends new event
   */
  async recordLLMUsage(runId: string, usage: LLMUsage): Promise<void> {
    const calculatedCost = this.pricingRegistry.calculateCost(usage);

    const event: CostEvent = {
      runId,
      timestamp: new Date().toISOString(),
      provider: usage.provider,
      model: usage.model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      cost: calculatedCost.totalCost,
      pricingSource: calculatedCost.pricingSource,
    };

    await this.storage.blockConcurrencyWhile(async () => {
      // Append-only: Never update, always push new event
      const key = this.getEventsKey(runId);
      const existing = (await this.storage.storage.get<CostEvent[]>(key)) ?? [];
      existing.push(event);
      await this.storage.storage.put(key, existing);
    });

    console.log(
      `[cost/tracker] Recorded event for run ${runId}: ` +
        `${usage.provider}:${usage.model} - $${event.cost.toFixed(6)} ` +
        `(${usage.totalTokens} tokens)`,
    );
  }

  /**
   * Get all cost events for a run
   */
  async getCostEvents(runId: string): Promise<CostEvent[]> {
    const key = this.getEventsKey(runId);
    return (await this.storage.storage.get<CostEvent[]>(key)) ?? [];
  }

  /**
   * Aggregate costs from events (computed on read, never stored)
   *
   * This ensures:
   * - No pre-computed totals that can drift
   * - Always accurate based on event log
   * - Full transparency in aggregation
   */
  async aggregateRunCost(runId: string): Promise<CostSnapshot> {
    const events = await this.getCostEvents(runId);

    const byModel: Record<string, ModelCost> = {};
    const byProvider: Record<string, ProviderCost> = {};
    let totalCost = 0;
    let totalTokens = 0;

    for (const event of events) {
      totalCost += event.cost;
      totalTokens += event.totalTokens;

      // Aggregate by model
      const modelKey = `${event.provider}:${event.model}`;
      if (!byModel[modelKey]) {
        byModel[modelKey] = {
          model: event.model,
          provider: event.provider,
          promptTokens: 0,
          completionTokens: 0,
          cost: 0,
        };
      }
      const modelData = byModel[modelKey];
      if (modelData) {
        modelData.promptTokens += event.promptTokens;
        modelData.completionTokens += event.completionTokens;
        modelData.cost += event.cost;
      }

      // Aggregate by provider
      if (!byProvider[event.provider]) {
        byProvider[event.provider] = {
          provider: event.provider,
          promptTokens: 0,
          completionTokens: 0,
          cost: 0,
        };
      }
      const providerData = byProvider[event.provider];
      if (providerData) {
        providerData.promptTokens += event.promptTokens;
        providerData.completionTokens += event.completionTokens;
        providerData.cost += event.cost;
      }
    }

    return {
      runId,
      totalCost,
      totalTokens,
      eventCount: events.length,
      byModel,
      byProvider,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get current accumulated cost for a run
   */
  async getCurrentCost(runId: string): Promise<number> {
    const events = await this.getCostEvents(runId);
    return events.reduce((sum, event) => sum + event.cost, 0);
  }

  private getEventsKey(runId: string): string {
    return `${this.EVENTS_KEY_PREFIX}${runId}${this.EVENTS_KEY_SUFFIX}`;
  }
}

export class CostTrackingError extends Error {
  constructor(message: string) {
    super(`[cost/tracker] ${message}`);
    this.name = "CostTrackingError";
  }
}
