import { CloudflareAgent } from "@shadowbox/orchestrator-adapters-cloudflare-agents";
import type { Env } from "../types/ai";
import { errorResponse } from "../http/response";
import { RunEngineRequestHandler } from "./RunEngineRequestHandler";
import { persistAssistantMessageFromRunResponse } from "./RunEngineResponsePersistence";

export class RunEngineAgent extends CloudflareAgent<Env> {
  private executionQueue: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const handler = new RunEngineRequestHandler(
      this.ctx,
      this.env,
      this.withExecutionLock.bind(this),
    );

    if (url.pathname === "/execute" && request.method === "POST") {
      return handler.handleExecuteRequest(request, async (result) => {
        await persistAssistantMessageFromRunResponse(
          this.ctx,
          this.env,
          result.sessionId,
          result.runId,
          result.correlationId,
          result.response,
        );
      });
    }

    if (url.pathname === "/summary" && request.method === "GET") {
      return handler.handleSummaryRequest(request);
    }

    if (url.pathname === "/cancel" && request.method === "POST") {
      return handler.handleCancelRequest(request);
    }

    if (url.pathname === "/debug/runtime" && request.method === "GET") {
      return handler.handleRuntimeDebugRequest(request);
    }

    return errorResponse(request, this.env, "Not Found", 404);
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
