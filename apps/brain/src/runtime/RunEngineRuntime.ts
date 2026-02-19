import type { DurableObjectState as LegacyDurableObjectState } from "@cloudflare/workers-types";
import type { CoreMessage } from "ai";
import { DurableObject } from "cloudflare:workers";
import { RunEngine } from "../core/engine/RunEngine";
import { tagRuntimeStateSemantics } from "@shadowbox/execution-engine/runtime";
import type { Env } from "../types/ai";
import type { IAgent } from "@shadowbox/execution-engine/runtime";
import { parseExecuteRunRequest } from "./parsing/RunEngineRequestParser";
import { validateProviderModelOverride } from "./policies/ProviderModelOverridePolicy";
import { buildRuntimeDependencies } from "./factories/ExecutionGatewayFactory";
import type { ExecuteRunPayload } from "./parsing/ExecuteRunPayloadSchema";
import { errorResponse } from "../http/response";
import { isDomainError, mapDomainErrorToHttp } from "../domain/errors";

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
      // Parse and validate request payload
      payload = await parseExecuteRunRequest(request);

      // Validate provider/model override pairing
      validateProviderModelOverride(payload);
    } catch (error: unknown) {
      if (isDomainError(error)) {
        const { status, message } = mapDomainErrorToHttp(error);
        return errorResponse(
          request,
          this.env as Env,
          message,
          status,
        );
      }
      const message =
        error instanceof Error ? error.message : "Invalid payload";
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

        // Build all runtime dependencies from factories
        const { agent, runEngineDeps } = buildRuntimeDependencies(
          this.ctx,
          this.env as Env,
          payload,
          { strict: true }, // Strict mode: fail on unsupported agent types
        );

        const runEngine = new RunEngine(
          runtimeState,
          {
            env: this.env as Env,
            sessionId: payload.sessionId,
            runId: payload.runId,
            correlationId: payload.correlationId,
            requestOrigin: payload.requestOrigin,
          },
          agent,
          undefined,
          runEngineDeps,
        );

        // Messages validated by zod schema in parser, cast to CoreMessage[] for type safety
        return runEngine.execute(
          payload.input,
          payload.messages as CoreMessage[],
          {},
        );
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "RunEngine DO execution failed";
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
