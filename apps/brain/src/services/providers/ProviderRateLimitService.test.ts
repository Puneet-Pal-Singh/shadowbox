import type { DurableObjectState } from "@cloudflare/workers-types";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../types/ai";
import { ProviderRateLimitService } from "./ProviderRateLimitService";

describe("ProviderRateLimitService", () => {
  it("blocks connect requests when limit is exceeded", async () => {
    const state = createMockDurableState();
    const service = ProviderRateLimitService.fromEnv(
      state,
      { runId: "run-1", userId: "user-1", workspaceId: "workspace-1" },
      createEnv({
        BYOK_CONNECT_RATE_LIMIT_MAX: "2",
        BYOK_CONNECT_RATE_LIMIT_WINDOW_SECONDS: "60",
      }),
    );

    await expect(service.enforce("connect")).resolves.toBeUndefined();
    await expect(service.enforce("connect")).resolves.toBeUndefined();
    await expect(service.enforce("connect")).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
  });

  it("resets counters when the window expires", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(2_000).mockReturnValueOnce(
      63_000,
    );

    const state = createMockDurableState();
    const service = ProviderRateLimitService.fromEnv(
      state,
      { runId: "run-2", userId: "user-2", workspaceId: "workspace-2" },
      createEnv({
        BYOK_VALIDATE_RATE_LIMIT_MAX: "2",
        BYOK_VALIDATE_RATE_LIMIT_WINDOW_SECONDS: "60",
      }),
    );

    await expect(service.enforce("validate")).resolves.toBeUndefined();
    await expect(service.enforce("validate")).resolves.toBeUndefined();
    await expect(service.enforce("validate")).resolves.toBeUndefined();
  });
});

function createEnv(overrides: Partial<Env>): Env {
  return {
    ...overrides,
  } as Env;
}

function createMockDurableState(): DurableObjectState {
  const storage = new Map<string, string>();
  return {
    storage: {
      put: async (key: string, value: string) => {
        storage.set(key, value);
      },
      get: async (key: string) => storage.get(key),
      delete: async (key: string) => {
        storage.delete(key);
      },
      list: async (options?: { prefix?: string }) => {
        const prefix = options?.prefix ?? "";
        const entries = new Map<string, string>();
        for (const [key, value] of storage.entries()) {
          if (key.startsWith(prefix)) {
            entries.set(key, value);
          }
        }
        return entries;
      },
    },
  } as unknown as DurableObjectState;
}
