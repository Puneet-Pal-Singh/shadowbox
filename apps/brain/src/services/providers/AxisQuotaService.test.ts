import { describe, expect, it } from "vitest";
import { AxisQuotaService } from "./AxisQuotaService";
import { DurableProviderStore } from "./DurableProviderStore";

interface MockStorage {
  put: (key: string, value: string | number) => Promise<void>;
  get: (key: string) => Promise<string | number | undefined>;
  delete: (key: string) => Promise<void>;
  list: (options?: { prefix: string }) => Promise<Map<string, string>>;
}

function createMockStorage(): MockStorage {
  const data = new Map<string, string | number>();
  return {
    put: async (key: string, value: string | number) => {
      data.set(key, value);
    },
    get: async (key: string) => data.get(key),
    delete: async (key: string) => {
      data.delete(key);
    },
    list: async (_options?: { prefix: string }) => new Map<string, string>(),
  };
}

function createStore(
  storage: MockStorage,
  userId: string,
  workspaceId: string,
): DurableProviderStore {
  const state = { storage };
  return new DurableProviderStore(
    state as unknown as ConstructorParameters<typeof DurableProviderStore>[0],
    {
      runId: "123e4567-e89b-42d3-a456-426614174000",
      userId,
      workspaceId,
    },
    "test-byok-encryption-key",
  );
}

describe("AxisQuotaService", () => {
  it("allows first five requests and blocks sixth", async () => {
    const service = new AxisQuotaService(
      createStore(createMockStorage(), "user-1", "workspace-1"),
      5,
    );
    for (let index = 1; index <= 5; index += 1) {
      const status = await service.consume();
      expect(status.used).toBe(index);
      expect(status.limit).toBe(5);
    }

    await expect(service.consume()).rejects.toMatchObject({
      code: "AXIS_DAILY_LIMIT_EXCEEDED",
      status: 429,
    });
  });

  it("resets usage on next UTC day boundary", async () => {
    const store = createStore(createMockStorage(), "user-1", "workspace-1");
    const service = new AxisQuotaService(store, 5);

    await store.setAxisQuotaUsage("2026-03-10", 5);

    const dayOne = new Date("2026-03-10T23:59:00.000Z");
    const dayTwo = new Date("2026-03-11T00:01:00.000Z");

    const dayOneStatus = await service.getStatus(dayOne);
    expect(dayOneStatus.used).toBe(5);

    const dayTwoStatus = await service.getStatus(dayTwo);
    expect(dayTwoStatus.used).toBe(0);
    expect(dayTwoStatus.limit).toBe(5);
  });

  it("isolates counters by user/workspace scope", async () => {
    const storage = createMockStorage();
    const serviceA = new AxisQuotaService(
      createStore(storage, "user-1", "workspace-1"),
      5,
    );
    const serviceB = new AxisQuotaService(
      createStore(storage, "user-2", "workspace-2"),
      5,
    );

    await serviceA.consume();
    const statusA = await serviceA.getStatus();
    const statusB = await serviceB.getStatus();

    expect(statusA.used).toBe(1);
    expect(statusB.used).toBe(0);
  });
});

