import type { DurableObjectState as LegacyDurableObjectState } from "@cloudflare/workers-types";
import type { CoreMessage } from "ai";
import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import { RunEngine } from "../core/engine/RunEngine";
import { tagRuntimeStateSemantics } from "../../../../packages/execution-engine/src/runtime";
import type { Env } from "../types/ai";

const ExecuteRunPayloadSchema = z.object({
  runId: z.string().min(1),
  sessionId: z.string().min(1),
  correlationId: z.string().min(1),
  requestOrigin: z.string().optional(),
  input: z.object({
    agentType: z.enum(["coding", "review", "ci"]),
    prompt: z.string().min(1),
    sessionId: z.string().min(1),
  }),
  messages: z.array(z.unknown()),
});

type ExecuteRunPayload = z.infer<typeof ExecuteRunPayloadSchema>;

export class RunEngineRuntime extends DurableObject {
  private executionQueue: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/execute") {
      return new Response("Not Found", { status: 404 });
    }
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let payload: ExecuteRunPayload;
    try {
      payload = ExecuteRunPayloadSchema.parse(await request.json());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Invalid payload";
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      return await this.withExecutionLock(async () => {
        const runtimeState = tagRuntimeStateSemantics(
          this.ctx as unknown as LegacyDurableObjectState,
          "do",
        );
        const runEngine = new RunEngine(runtimeState, {
          env: this.env as Env,
          sessionId: payload.sessionId,
          runId: payload.runId,
          correlationId: payload.correlationId,
          requestOrigin: payload.requestOrigin,
        });

        return runEngine.execute(payload.input, payload.messages as CoreMessage[], {});
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "RunEngine DO execution failed";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  private async withExecutionLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.executionQueue;
    let release: () => void = () => {};
    this.executionQueue = new Promise<void>((resolve) => {
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
