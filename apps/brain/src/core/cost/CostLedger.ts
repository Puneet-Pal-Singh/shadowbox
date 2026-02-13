import type { DurableObjectState } from "@cloudflare/workers-types";
import type {
  CostEvent,
  CostSnapshot,
  ModelCost,
  ProviderCost,
} from "./types";

export interface ICostLedger {
  append(event: CostEvent): Promise<void>;
  getEvents(runId: string): Promise<CostEvent[]>;
  aggregate(runId: string): Promise<CostSnapshot>;
  getCurrentCost(runId: string): Promise<number>;
}

export class CostLedger implements ICostLedger {
  private readonly EVENTS_KEY_SUFFIX = ":cost:events";
  private readonly IDEMPOTENCY_KEY_PREFIX = ":cost:idempotency:";

  constructor(private storage: DurableObjectState) {}

  async append(event: CostEvent): Promise<void> {
    const eventsKey = this.getEventsKey(event.runId);
    const idempotencyKey = this.getIdempotencyIndexKey(
      event.runId,
      event.idempotencyKey,
    );
    let appended = false;

    await this.storage.blockConcurrencyWhile(async () => {
      const existingEventId = await this.storage.storage.get<string>(
        idempotencyKey,
      );
      if (existingEventId) {
        console.log(
          `[cost/ledger] append skipped duplicate run=${event.runId} key=${event.idempotencyKey}`,
        );
        return;
      }

      const events = (await this.storage.storage.get<CostEvent[]>(eventsKey)) ?? [];
      events.push(event);

      await this.storage.storage.put(eventsKey, events);
      await this.storage.storage.put(idempotencyKey, event.eventId);
      appended = true;
    });

    if (appended) {
      console.log(
        `[cost/ledger] append run=${event.runId} phase=${event.phase} source=${event.pricingSource} cost=${event.calculatedCostUsd.toFixed(6)}`,
      );
    }
  }

  async getEvents(runId: string): Promise<CostEvent[]> {
    return (await this.storage.storage.get<CostEvent[]>(this.getEventsKey(runId))) ?? [];
  }

  async aggregate(runId: string): Promise<CostSnapshot> {
    const events = await this.getEvents(runId);
    const byModel: Record<string, ModelCost> = {};
    const byProvider: Record<string, ProviderCost> = {};
    let totalCost = 0;
    let totalTokens = 0;

    for (const event of events) {
      totalCost += event.calculatedCostUsd;
      totalTokens += event.totalTokens;

      const modelKey = `${event.provider}:${event.model}`;
      if (!byModel[modelKey]) {
        byModel[modelKey] = {
          model: event.model,
          provider: event.provider,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0,
        };
      }
      const modelEntry = byModel[modelKey];
      if (modelEntry) {
        modelEntry.promptTokens += event.promptTokens;
        modelEntry.completionTokens += event.completionTokens;
        modelEntry.totalTokens += event.totalTokens;
        modelEntry.cost += event.calculatedCostUsd;
      }

      if (!byProvider[event.provider]) {
        byProvider[event.provider] = {
          provider: event.provider,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0,
        };
      }
      const providerEntry = byProvider[event.provider];
      if (providerEntry) {
        providerEntry.promptTokens += event.promptTokens;
        providerEntry.completionTokens += event.completionTokens;
        providerEntry.totalTokens += event.totalTokens;
        providerEntry.cost += event.calculatedCostUsd;
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

  async getCurrentCost(runId: string): Promise<number> {
    const snapshot = await this.aggregate(runId);
    return snapshot.totalCost;
  }

  private getEventsKey(runId: string): string {
    return `run:${runId}${this.EVENTS_KEY_SUFFIX}`;
  }

  private getIdempotencyIndexKey(runId: string, idempotencyKey: string): string {
    return `run:${runId}${this.IDEMPOTENCY_KEY_PREFIX}${idempotencyKey}`;
  }
}
