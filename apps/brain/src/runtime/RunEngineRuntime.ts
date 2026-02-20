import type { DurableObjectState as LegacyDurableObjectState } from "@cloudflare/workers-types";
import type { CoreMessage } from "ai";
import { DurableObject } from "cloudflare:workers";
import { RunEngine } from "@shadowbox/execution-engine/runtime/engine";
import { tagRuntimeStateSemantics } from "@shadowbox/execution-engine/runtime";
import type { Env } from "../types/ai";
import { parseExecuteRunRequest } from "./parsing/RunEngineRequestParser";
import { validateProviderModelOverride } from "./policies/ProviderModelOverridePolicy";
import { buildRuntimeDependencies } from "./factories/ExecutionGatewayFactory";
import type { ExecuteRunPayload } from "./parsing/ExecuteRunPayloadSchema";
import { errorResponse, jsonResponse } from "../http/response";
import {
  ValidationError,
  isDomainError,
  mapDomainErrorToHttp,
} from "../domain/errors";
import { parseRequestBody, validateWithSchema } from "../http/validation";
import {
  ConnectProviderRequestSchema,
  DisconnectProviderRequestSchema,
  ProviderIdSchema,
  type ProviderId,
} from "../schemas/provider";
import {
  DurableProviderStore,
  ProviderConfigService,
} from "../services/providers";

export class RunEngineRuntime extends DurableObject {
  private executionQueue: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/execute" && request.method === "POST") {
      return this.handleExecuteRequest(request);
    }

    if (url.pathname.startsWith("/providers/")) {
      return this.handleProviderRequest(request, url);
    }

    return new Response("Not Found", { status: 404 });
  }

  private async handleExecuteRequest(request: Request): Promise<Response> {
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

  private async handleProviderRequest(
    request: Request,
    url: URL,
  ): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    const env = this.env as Env;

    try {
      const runId = this.resolveProviderRunId(request, correlationId);
      const configService = this.createProviderConfigService(runId);

      if (url.pathname === "/providers/connect" && request.method === "POST") {
        const body = await parseRequestBody(request, correlationId);
        const validatedRequest = validateWithSchema<{
          providerId: ProviderId;
          apiKey: string;
        }>(body, ConnectProviderRequestSchema, correlationId);
        const response = await configService.connect(validatedRequest);
        return jsonResponse(request, env, response);
      }

      if (
        url.pathname === "/providers/disconnect" &&
        request.method === "POST"
      ) {
        const body = await parseRequestBody(request, correlationId);
        const validatedRequest = validateWithSchema<{
          providerId: ProviderId;
        }>(body, DisconnectProviderRequestSchema, correlationId);
        const response = await configService.disconnect(validatedRequest);
        return jsonResponse(request, env, response);
      }

      if (url.pathname === "/providers/status" && request.method === "GET") {
        const providers = await configService.getStatus();
        return jsonResponse(request, env, { providers });
      }

      if (url.pathname === "/providers/models" && request.method === "GET") {
        const providerIdParam = url.searchParams.get("providerId");
        if (!providerIdParam) {
          throw new ValidationError(
            "Missing required query parameter: providerId",
            "MISSING_PROVIDER_ID",
            correlationId,
          );
        }

        const providerId = validateWithSchema<ProviderId>(
          providerIdParam,
          ProviderIdSchema,
          correlationId,
        );
        const response = await configService.getModels(providerId);
        return jsonResponse(request, env, response);
      }

      return new Response("Method Not Allowed", { status: 405 });
    } catch (error: unknown) {
      if (isDomainError(error)) {
        const { status, code, message } = mapDomainErrorToHttp(error);
        return errorResponse(request, env, message, status, code);
      }

      const message =
        error instanceof Error ? error.message : "Provider route failed";
      return errorResponse(request, env, message, 500);
    }
  }

  private resolveProviderRunId(request: Request, correlationId: string): string {
    const runId = request.headers.get("X-Run-Id");
    if (!runId) {
      throw new ValidationError(
        "Missing required X-Run-Id header",
        "MISSING_RUN_ID",
        correlationId,
      );
    }
    return runId;
  }

  private createProviderConfigService(runId: string): ProviderConfigService {
    const durableProviderStore = new DurableProviderStore(
      this.ctx as unknown as LegacyDurableObjectState,
      runId,
    );
    return new ProviderConfigService(this.env as Env, durableProviderStore);
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
