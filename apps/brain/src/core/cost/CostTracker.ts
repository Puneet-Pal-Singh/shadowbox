import type { DurableObjectState } from "@cloudflare/workers-types";
import type { CostEvent, CostSnapshot, LLMUsage } from "./types";
import type { IPricingRegistry } from "./PricingRegistry";
import { CostLedger, type ICostLedger } from "./CostLedger";
import { PricingResolver } from "./PricingResolver";

/**
 * Compatibility wrapper retained during migration to CostLedger.
 */
export interface ICostTracker {
  recordLLMUsage(runId: string, usage: LLMUsage): Promise<void>;
  getCostEvents(runId: string): Promise<CostEvent[]>;
  aggregateRunCost(runId: string): Promise<CostSnapshot>;
  getCurrentCost(runId: string): Promise<number>;
}

export class CostTracker implements ICostTracker {
  private readonly ledger: ICostLedger;
  private readonly pricingResolver: PricingResolver;

  constructor(
    storage: DurableObjectState,
    pricingRegistry: IPricingRegistry,
    unknownPricingMode: "warn" | "block" = "warn",
  ) {
    this.ledger = new CostLedger(storage);
    this.pricingResolver = new PricingResolver(pricingRegistry, {
      unknownPricingMode,
    });
  }

  async recordLLMUsage(runId: string, usage: LLMUsage): Promise<void> {
    const resolution = this.pricingResolver.resolve(usage, usage.raw);
    const timestamp = new Date().toISOString();
    const idempotencyKey = await this.buildIdempotencyKey(runId, usage);

    const event: CostEvent = {
      eventId: crypto.randomUUID(),
      idempotencyKey,
      runId,
      // Compatibility path does not have explicit sessionId/task context.
      sessionId: runId,
      agentType: "compat",
      phase: "task",
      provider: usage.provider,
      model: usage.model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      providerCostUsd: resolution.providerCostUsd,
      calculatedCostUsd: resolution.calculatedCostUsd,
      pricingSource: resolution.pricingSource,
      createdAt: timestamp,
    };

    await this.ledger.append(event);
  }

  async getCostEvents(runId: string): Promise<CostEvent[]> {
    return this.ledger.getEvents(runId);
  }

  async aggregateRunCost(runId: string): Promise<CostSnapshot> {
    return this.ledger.aggregate(runId);
  }

  async getCurrentCost(runId: string): Promise<number> {
    return this.ledger.getCurrentCost(runId);
  }

  private async buildIdempotencyKey(
    runId: string,
    usage: LLMUsage,
  ): Promise<string> {
    const fingerprint = [
      runId,
      usage.provider,
      usage.model,
      usage.promptTokens.toString(),
      usage.completionTokens.toString(),
      usage.totalTokens.toString(),
      typeof usage.cost === "number" ? usage.cost.toString() : "",
    ].join("|");

    const encoded = new TextEncoder().encode(fingerprint);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    const hash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    return `compat:${hash}`;
  }
}

export class CostTrackingError extends Error {
  constructor(message: string) {
    super(`[cost/tracker] ${message}`);
    this.name = "CostTrackingError";
  }
}
