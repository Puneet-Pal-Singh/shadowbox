import { describe, expect, it } from "vitest";
import type { Env } from "../types/ai";
import { RunAdmissionService } from "./RunAdmissionService";

describe("RunAdmissionService", () => {
  it("blocks run submissions when emergency shutoff is active", async () => {
    const service = new RunAdmissionService(
      createEnv({
        LAUNCH_EMERGENCY_SHUTOFF_MODE: "block_runs",
      }),
    );

    await expect(
      service.enforce(
        {
          userId: "user-1",
          workspaceId: "workspace-1",
          mode: "build",
          workflowIntent: "build",
        },
        "corr-1",
      ),
    ).rejects.toMatchObject({
      code: "EMERGENCY_SHUTOFF_ACTIVE",
      status: 503,
    });
  });

  it("enforces run submission limit within the configured window", async () => {
    const service = new RunAdmissionService(
      createEnv({
        RUN_SUBMISSION_RATE_LIMIT_MAX: "2",
        RUN_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS: "60",
      }),
    );

    await expect(
      service.enforce(
        {
          userId: "user-2",
          workspaceId: "workspace-2",
          mode: "plan",
          workflowIntent: "explore",
        },
        "corr-2",
      ),
    ).resolves.toBeUndefined();
    await expect(
      service.enforce(
        {
          userId: "user-2",
          workspaceId: "workspace-2",
          mode: "plan",
          workflowIntent: "explore",
        },
        "corr-2",
      ),
    ).resolves.toBeUndefined();
    await expect(
      service.enforce(
        {
          userId: "user-2",
          workspaceId: "workspace-2",
          mode: "plan",
          workflowIntent: "explore",
        },
        "corr-2",
      ),
    ).rejects.toMatchObject({
      code: "RUN_SUBMISSION_RATE_LIMITED",
      status: 429,
    });
  });

  it("uses mutation-specific limits for mutation-capable runs", async () => {
    const service = new RunAdmissionService(
      createEnv({
        MUTATION_RUN_SUBMISSION_RATE_LIMIT_MAX: "1",
        MUTATION_RUN_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS: "60",
      }),
    );

    await expect(
      service.enforce(
        {
          userId: "user-3",
          workspaceId: "workspace-3",
          mode: "build",
          workflowIntent: "build",
        },
        "corr-3",
      ),
    ).resolves.toBeUndefined();
    await expect(
      service.enforce(
        {
          userId: "user-3",
          workspaceId: "workspace-3",
          mode: "build",
          workflowIntent: "build",
        },
        "corr-3",
      ),
    ).rejects.toMatchObject({
      code: "RUN_SUBMISSION_RATE_LIMITED",
      status: 429,
    });
  });
});

function createEnv(overrides: Partial<Env>): Env {
  return {
    SESSIONS: createMockKvNamespace(),
    ...overrides,
  } as Env;
}

function createMockKvNamespace(): Env["SESSIONS"] {
  const storage = new Map<string, string>();
  return {
    get: async (key: string) => storage.get(key) ?? null,
    put: async (key: string, value: string) => {
      storage.set(key, value);
    },
  } as Env["SESSIONS"];
}
