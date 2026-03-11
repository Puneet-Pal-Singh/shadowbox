import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeDurableObjectState, RuntimeStorage } from "../types.js";
import { PermissionApprovalStore } from "./PermissionApprovalStore.js";

describe("PermissionApprovalStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("expires cross-repo approvals deterministically by TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const state = new MockRuntimeState();
    const store = new PermissionApprovalStore(state, "run-approval-1");

    await store.grantCrossRepo("acme/platform-core", 1_000);
    await expect(store.hasCrossRepo("acme/platform-core")).resolves.toBe(true);

    vi.setSystemTime(new Date("2026-01-01T00:00:01.500Z"));
    await expect(store.hasCrossRepo("acme/platform-core")).resolves.toBe(false);
    await expect(store.hasCrossRepo("acme/platform-core")).resolves.toBe(false);
  });

  it("expires destructive approvals deterministically by TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const state = new MockRuntimeState();
    const store = new PermissionApprovalStore(state, "run-approval-2");

    await store.grantDestructive(1_000);
    await expect(store.hasDestructive()).resolves.toBe(true);

    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    await expect(store.hasDestructive()).resolves.toBe(false);
    await expect(store.hasDestructive()).resolves.toBe(false);
  });
});

class InMemoryStorage implements RuntimeStorage {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string | string[]): Promise<boolean | number> {
    if (Array.isArray(key)) {
      let deleted = 0;
      for (const entry of key) {
        if (this.store.delete(entry)) {
          deleted += 1;
        }
      }
      return deleted;
    }
    return this.store.delete(key);
  }

  async list<T>(options?: {
    prefix?: string;
    start?: string;
    end?: string;
    limit?: number;
  }): Promise<Map<string, T>> {
    const output = new Map<string, T>();
    const prefix = options?.prefix;
    const start = options?.start;
    const end = options?.end;
    const limit = options?.limit;

    for (const [key, value] of this.store.entries()) {
      if (prefix && !key.startsWith(prefix)) {
        continue;
      }
      if (start && key < start) {
        continue;
      }
      if (end && key >= end) {
        continue;
      }
      output.set(key, value as T);
      if (typeof limit === "number" && output.size >= limit) {
        break;
      }
    }

    return output;
  }
}

class MockRuntimeState implements RuntimeDurableObjectState {
  storage: RuntimeStorage = new InMemoryStorage();

  async blockConcurrencyWhile<T>(closure: () => Promise<T>): Promise<T> {
    return await closure();
  }
}
