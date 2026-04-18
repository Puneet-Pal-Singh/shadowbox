import { describe, expect, it } from "vitest";
import { Run } from "../run/index.js";
import type { RuntimeDurableObjectState, RuntimeStorage } from "../types.js";
import { PermissionApprovalStore } from "./PermissionApprovalStore.js";
import { waitForApprovalDecision } from "./RunApprovalWaitPolicy.js";
import { RunRepository } from "../run/index.js";

describe("waitForApprovalDecision", () => {
  it("consumes allow-once approvals before returning approved", async () => {
    const state = new MockRuntimeState();
    const runRepo = new RunRepository(state);
    const permissionApprovalStore = new PermissionApprovalStore(state, "run-approval-wait");

    await runRepo.create(
      new Run(
        "run-approval-wait",
        "session-1",
        "RUNNING",
        "coding",
        {
          agentType: "coding",
          prompt: "run tests",
          sessionId: "session-1",
        },
      ),
    );

    const request = await permissionApprovalStore.setPendingRequest({
      requestId: "req-approval-wait",
      runId: "run-approval-wait",
      origin: "agent",
      category: "shell_command",
      title: "Run tests",
      reason: "Shell commands can mutate state.",
      actionFingerprint: "shell:pnpm test",
      availableDecisions: ["allow_once", "deny"],
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    await permissionApprovalStore.resolveDecision(
      { kind: "allow_once", requestId: request.requestId },
      "user-1",
    );

    const outcome = await waitForApprovalDecision({
      request,
      env: { NODE_ENV: "test" },
      runId: "run-approval-wait",
      runRepo,
      permissionApprovalStore,
    });

    expect(outcome).toEqual({
      outcome: "approved",
      decision: "allow_once",
    });
    await expect(
      permissionApprovalStore.isActionAllowed("shell:pnpm test"),
    ).resolves.toBe(false);
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

  async list<T>(): Promise<Map<string, T>> {
    return new Map();
  }
}

class MockRuntimeState implements RuntimeDurableObjectState {
  storage: RuntimeStorage = new InMemoryStorage();

  async blockConcurrencyWhile<T>(closure: () => Promise<T>): Promise<T> {
    return await closure();
  }
}
