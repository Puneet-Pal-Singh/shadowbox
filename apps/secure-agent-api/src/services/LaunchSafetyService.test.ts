import { describe, expect, it } from "vitest";
import type { DurableObjectId, Fetcher } from "@cloudflare/workers-types";
import { enforceLaunchSafetyForRoute } from "./LaunchSafetyService";

describe("LaunchSafetyService", () => {
  it("blocks expensive routes when emergency shutoff is active", async () => {
    const response = await enforceLaunchSafetyForRoute(
      new Request("https://secure.local/api/v1/session", {
        method: "POST",
      }),
      {
        LAUNCH_EMERGENCY_SHUTOFF_MODE: "block_session_and_execute",
      },
      "session_create",
    );

    expect(response?.status).toBe(503);
  });

  it("returns 503 when limiter is required but unavailable", async () => {
    const response = await enforceLaunchSafetyForRoute(
      new Request("https://secure.local/api/v1/session", {
        method: "POST",
      }),
      {
        LAUNCH_RATE_LIMIT_REQUIRED: "true",
      },
      "session_create",
    );

    expect(response?.status).toBe(503);
    const payload = (await response?.json()) as { code: string };
    expect(payload.code).toBe("LAUNCH_RATE_LIMITER_UNAVAILABLE");
  });

  it("enforces per-route rate limits", async () => {
    const env = {
      LAUNCH_RATE_LIMITER: createMockLimiterNamespace(),
      SESSION_CREATE_RATE_LIMIT_AUTH_MAX: "1",
      SESSION_CREATE_RATE_LIMIT_WINDOW_SECONDS: "60",
    };

    const first = await enforceLaunchSafetyForRoute(
      new Request("https://secure.local/api/v1/session", {
        method: "POST",
        headers: {
          Authorization: "Bearer test",
          "CF-Connecting-IP": "203.0.113.1",
        },
      }),
      env,
      "session_create",
    );
    expect(first).toBeNull();

    const second = await enforceLaunchSafetyForRoute(
      new Request("https://secure.local/api/v1/session", {
        method: "POST",
        headers: {
          Authorization: "Bearer test",
          "CF-Connecting-IP": "203.0.113.1",
        },
      }),
      env,
      "session_create",
    );

    expect(second?.status).toBe(429);
    const payload = (await second?.json()) as { code: string };
    expect(payload.code).toBe("ROUTE_RATE_LIMITED");
  });
});

function createMockLimiterNamespace(): DurableObjectNamespace {
  const stateByScope = new Map<string, Map<string, CounterState>>();

  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get(id: DurableObjectId) {
      const scope = id.toString();
      return {
        fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
          if (!init?.body || typeof init.body !== "string") {
            return new Response("Invalid payload", { status: 400 });
          }

          const payload = JSON.parse(init.body) as {
            routeClass: string;
            limit: number;
            windowSeconds: number;
          };

          const windowMs = payload.windowSeconds * 1000;
          const now = Date.now();
          const activeWindow = Math.floor(now / windowMs);
          const counters = stateByScope.get(scope) ?? new Map<string, CounterState>();
          stateByScope.set(scope, counters);
          const key = payload.routeClass;
          const current = counters.get(key);

          if (!current || current.windowBucket !== activeWindow) {
            counters.set(key, { windowBucket: activeWindow, count: 1 });
            return json({ allowed: true, retryAfterSeconds: 0 });
          }

          if (current.count >= payload.limit) {
            return json({ allowed: false, retryAfterSeconds: 1 });
          }

          counters.set(key, {
            windowBucket: current.windowBucket,
            count: current.count + 1,
          });
          return json({ allowed: true, retryAfterSeconds: 0 });
        },
      } as unknown as Fetcher;
    },
  } as unknown as DurableObjectNamespace;
}

interface CounterState {
  windowBucket: number;
  count: number;
}

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
