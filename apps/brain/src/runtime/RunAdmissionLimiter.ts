import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import type { Env } from "../types/ai";

const EnforceRequestSchema = z.object({
  bucket: z.enum(["run_submission", "mutation_run_submission"]),
  limit: z.number().int().positive(),
  windowSeconds: z.number().int().positive(),
});

type EnforceRequest = z.infer<typeof EnforceRequestSchema>;

interface EnforceResponse {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface WindowCounterState {
  windowBucket: number;
  count: number;
}

const COUNTER_KEY_PREFIX = "launch:admission:v1:";

export class RunAdmissionLimiter extends DurableObject {
  private admissionQueue: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/enforce") {
      return new Response("Not Found", { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    return this.withAdmissionLock(async () => {
      try {
        const payload = EnforceRequestSchema.parse(await request.json());
        const result = await this.enforceLimit(payload);

        return jsonResponse(result, 200);
      } catch (error: unknown) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          return jsonResponse({ error: "Invalid run admission payload" }, 400);
        }

        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[run/admission-limiter] Failed to enforce limit:", message);
        return jsonResponse({ error: "Failed to enforce run admission limit" }, 500);
      }
    });
  }

  private async enforceLimit(payload: EnforceRequest): Promise<EnforceResponse> {
    const now = Date.now();
    const windowMs = payload.windowSeconds * 1000;
    const activeWindow = Math.floor(now / windowMs);
    const key = this.buildCounterKey(payload.bucket);
    const current = await this.readCounter(key);

    if (!current || current.windowBucket !== activeWindow) {
      await this.writeCounter(key, {
        windowBucket: activeWindow,
        count: 1,
      });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (current.count >= payload.limit) {
      return {
        allowed: false,
        retryAfterSeconds: this.computeRetryAfterSeconds(
          activeWindow,
          windowMs,
          now,
        ),
      };
    }

    await this.writeCounter(key, {
      windowBucket: current.windowBucket,
      count: current.count + 1,
    });

    return { allowed: true, retryAfterSeconds: 0 };
  }

  private async readCounter(key: string): Promise<WindowCounterState | null> {
    const raw = await this.ctx.storage.get<string>(key);
    if (typeof raw !== "string") {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as WindowCounterState;
      if (
        !Number.isInteger(parsed.windowBucket) ||
        !Number.isInteger(parsed.count) ||
        parsed.windowBucket < 0 ||
        parsed.count < 0
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private async writeCounter(
    key: string,
    state: WindowCounterState,
  ): Promise<void> {
    await this.ctx.storage.put(key, JSON.stringify(state));
  }

  private computeRetryAfterSeconds(
    windowBucket: number,
    windowMs: number,
    now: number,
  ): number {
    const windowEnd = (windowBucket + 1) * windowMs;
    const remainingMs = Math.max(windowEnd - now, 1000);
    return Math.ceil(remainingMs / 1000);
  }

  private buildCounterKey(bucket: EnforceRequest["bucket"]): string {
    return `${COUNTER_KEY_PREFIX}${bucket}`;
  }

  private async withAdmissionLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.admissionQueue;
    let release: () => void = () => {};
    this.admissionQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
