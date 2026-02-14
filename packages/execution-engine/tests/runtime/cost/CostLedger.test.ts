import { describe, it, expect, beforeEach, vi } from "vitest";
import { CostLedger } from "../../../src/runtime/cost/CostLedger.js";
import type { CostEvent, RuntimeDurableObjectState } from "../../../src/runtime/cost/types.js";

describe("CostLedger", () => {
  let storage: Map<string, unknown>;
  let ctx: RuntimeDurableObjectState;
  let ledger: CostLedger;

  beforeEach(() => {
    storage = new Map<string, unknown>();
    ctx = {
      storage: {
        get: vi.fn(async <T>(key: string) => storage.get(key) as T | undefined),
        put: vi.fn(async (key: string, value: unknown) => {
          storage.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
          storage.delete(key);
          return true;
        }),
        list: vi.fn(async () => new Map()),
      } as RuntimeDurableObjectState["storage"],
      blockConcurrencyWhile: vi.fn(async <T>(closure: () => Promise<T>) =>
        closure(),
      ),
    } as RuntimeDurableObjectState;

    ledger = new CostLedger(ctx);
  });

  it("appends events and aggregates totals", async () => {
    await ledger.append(createEvent("event-1", "key-1", 0.12));
    await ledger.append(createEvent("event-2", "key-2", 0.08));

    const events = await ledger.getEvents("run-1");
    expect(events).toHaveLength(2);

    const snapshot = await ledger.aggregate("run-1");
    expect(snapshot.totalCost).toBeCloseTo(0.2, 6);
    expect(snapshot.eventCount).toBe(2);
    expect(snapshot.totalTokens).toBe(600);
  });

  it("skips duplicate events by idempotency key", async () => {
    const original = createEvent("event-1", "same-key", 0.12);
    const duplicate = createEvent("event-2", "same-key", 0.99);

    await ledger.append(original);
    await ledger.append(duplicate);

    const events = await ledger.getEvents("run-1");
    expect(events).toHaveLength(1);
    expect(events[0].eventId).toBe("event-1");
    expect(events[0].calculatedCostUsd).toBe(0.12);
  });
});

function createEvent(
  eventId: string,
  idempotencyKey: string,
  cost: number,
): CostEvent {
  return {
    eventId,
    idempotencyKey,
    runId: "run-1",
    sessionId: "session-1",
    agentType: "coding",
    phase: "task",
    provider: "openai",
    model: "gpt-4o",
    promptTokens: 100,
    completionTokens: 200,
    totalTokens: 300,
    calculatedCostUsd: cost,
    pricingSource: "registry",
    createdAt: new Date().toISOString(),
  };
}
