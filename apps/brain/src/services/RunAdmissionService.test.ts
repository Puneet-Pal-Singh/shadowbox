import { describe, expect, it } from "vitest";
import type { DurableObjectId, Fetcher } from "@cloudflare/workers-types";
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

  it("enforces limits atomically for concurrent submissions", async () => {
    const service = new RunAdmissionService(
      createEnv({
        RUN_SUBMISSION_RATE_LIMIT_MAX: "3",
        RUN_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS: "60",
      }),
    );

    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        service.enforce(
          {
            userId: "user-atomic",
            workspaceId: "workspace-atomic",
            mode: "plan",
            workflowIntent: "explore",
          },
          `corr-atomic-${index}`,
        ),
      ),
    );

    const accepted = attempts.filter(
      (attempt): attempt is PromiseFulfilledResult<void> =>
        attempt.status === "fulfilled",
    );
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === "rejected",
    );

    expect(accepted).toHaveLength(3);
    expect(rejected).toHaveLength(5);
    for (const attempt of rejected) {
      expect(attempt.reason).toMatchObject({
        code: "RUN_SUBMISSION_RATE_LIMITED",
        status: 429,
      });
    }
  });

  it("returns a typed error when limiter binding is unavailable", async () => {
    const service = new RunAdmissionService({
      ...createEnv({}),
      RUN_ADMISSION_LIMITER: undefined,
    } as Env);

    await expect(
      service.enforce(
        {
          userId: "user-missing-limiter",
          workspaceId: "workspace-missing-limiter",
          mode: "plan",
          workflowIntent: "explore",
        },
        "corr-missing-limiter",
      ),
    ).rejects.toMatchObject({
      code: "RUN_ADMISSION_LIMITER_UNAVAILABLE",
      status: 503,
      correlationId: "corr-missing-limiter",
    });
  });

  it("returns a typed error when limiter response payload is invalid", async () => {
    const service = new RunAdmissionService(
      createEnv({
        RUN_ADMISSION_LIMITER: createInvalidPayloadLimiterNamespace(),
      }),
    );

    await expect(
      service.enforce(
        {
          userId: "user-invalid-payload",
          workspaceId: "workspace-invalid-payload",
          mode: "plan",
          workflowIntent: "explore",
        },
        "corr-invalid-payload",
      ),
    ).rejects.toMatchObject({
      code: "RUN_ADMISSION_LIMITER_INVALID_RESPONSE",
      status: 503,
      correlationId: "corr-invalid-payload",
    });
  });

  it("uses fingerprinted scope when user or workspace is unknown", async () => {
    const service = new RunAdmissionService(
      createEnv({
        RUN_SUBMISSION_RATE_LIMIT_MAX: "1",
        RUN_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS: "60",
      }),
    );

    await expect(
      service.enforce(
        {
          mode: "plan",
          workflowIntent: "explore",
          clientFingerprint: "fp-a",
        },
        "corr-fp-a",
      ),
    ).resolves.toBeUndefined();

    await expect(
      service.enforce(
        {
          mode: "plan",
          workflowIntent: "explore",
          clientFingerprint: "fp-b",
        },
        "corr-fp-b",
      ),
    ).resolves.toBeUndefined();

    await expect(
      service.enforce(
        {
          mode: "plan",
          workflowIntent: "explore",
          clientFingerprint: "fp-a",
        },
        "corr-fp-a-2",
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
    RUN_ADMISSION_LIMITER: createMockRunAdmissionLimiterNamespace(),
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

function createMockRunAdmissionLimiterNamespace(): Env["RUN_ADMISSION_LIMITER"] {
  const stateByScope = new Map<string, Map<string, CounterState>>();
  const queueByScope = new Map<string, Promise<void>>();

  const withScopeLock = async <T>(
    scope: string,
    operation: () => Promise<T>,
  ): Promise<T> => {
    const previous = queueByScope.get(scope) ?? Promise.resolve();
    let release: () => void = () => {};
    queueByScope.set(
      scope,
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  };

  return {
    idFromName(name: string) {
      return {
        toString: () => name,
      } as DurableObjectId;
    },
    get(id: DurableObjectId) {
      const scope = id.toString();
      return {
        fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
          if (!init?.body || typeof init.body !== "string") {
            return new Response("Invalid payload", { status: 400 });
          }

          const payload = JSON.parse(init.body) as {
            bucket: string;
            limit: number;
            windowSeconds: number;
          };

          return withScopeLock(scope, async () => {
            const windowMs = payload.windowSeconds * 1000;
            const now = Date.now();
            const activeWindow = Math.floor(now / windowMs);
            const counters =
              stateByScope.get(scope) ?? new Map<string, CounterState>();
            stateByScope.set(scope, counters);

            const current = counters.get(payload.bucket);
            if (!current || current.windowBucket !== activeWindow) {
              counters.set(payload.bucket, {
                windowBucket: activeWindow,
                count: 1,
              });
              return new Response(
                JSON.stringify({ allowed: true, retryAfterSeconds: 0 }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }

            if (current.count >= payload.limit) {
              return new Response(
                JSON.stringify({ allowed: false, retryAfterSeconds: 1 }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }

            counters.set(payload.bucket, {
              windowBucket: current.windowBucket,
              count: current.count + 1,
            });

            return new Response(
              JSON.stringify({ allowed: true, retryAfterSeconds: 0 }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            );
          });
        },
      } as Fetcher;
    },
  } as unknown as Env["RUN_ADMISSION_LIMITER"];
}

function createInvalidPayloadLimiterNamespace(): Env["RUN_ADMISSION_LIMITER"] {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get(_id: DurableObjectId) {
      return {
        fetch: async () =>
          new Response(JSON.stringify({ allowed: "yes" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      } as Fetcher;
    },
  } as unknown as Env["RUN_ADMISSION_LIMITER"];
}

interface CounterState {
  windowBucket: number;
  count: number;
}
