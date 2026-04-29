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

  it("allows submissions without rate or concurrency enforcement", async () => {
    const service = new RunAdmissionService(
      createEnv({
        RUN_SUBMISSION_RATE_LIMIT_MAX: "1",
        MUTATION_RUN_SUBMISSION_RATE_LIMIT_MAX: "1",
        ACTIVE_EXPENSIVE_RUNS_PER_SESSION_MAX: "1",
        ACTIVE_EXPENSIVE_RUNS_PER_USER_MAX: "1",
        ACTIVE_EXPENSIVE_RUNS_PER_WORKSPACE_MAX: "1",
      }),
    );

    await expect(
      service.enforce(
        {
          userId: "user-2",
          workspaceId: "workspace-2",
          sessionId: "session-a",
          mode: "build",
          workflowIntent: "build",
        },
        "corr-2a",
      ),
    ).resolves.toEqual({});

    await expect(
      service.enforce(
        {
          userId: "user-2",
          workspaceId: "workspace-2",
          sessionId: "session-b",
          mode: "build",
          workflowIntent: "build",
        },
        "corr-2b",
      ),
    ).resolves.toEqual({});
  });
});

function createEnv(overrides: Partial<Env>): Env {
  return {
    ...overrides,
  } as Env;
}
