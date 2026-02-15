import { DurableObject } from "cloudflare:workers";
import type { DurableObjectState as LegacyDurableObjectState } from "@cloudflare/workers-types";
import { z } from "zod";
import {
  SessionMemoryStore,
  type MemoryEvent,
  type MemorySnapshot,
  MemoryEventSchema,
  MemorySnapshotSchema,
} from "@shadowbox/execution-engine/runtime";
import type { Env } from "../types/ai";
import { getCorsHeaders } from "../lib/cors";

// Type alias for the DurableObjectState from cloudflare:workers
type DurableObjectState = ConstructorParameters<
  typeof DurableObject
>[0] extends { ctx: infer C }
  ? C
  : LegacyDurableObjectState;

export class SessionMemoryRuntime extends DurableObject {
  private memoryStore: SessionMemoryStore;

  constructor(ctx: unknown, private _env: Env) {
    super(ctx as ConstructorParameters<typeof DurableObject>[0], _env);
    this.memoryStore = new SessionMemoryStore({
      ctx: ctx as unknown as import("@shadowbox/execution-engine/runtime").RuntimeDurableObjectState,
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = getCorsHeaders(request, this._env);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      switch (url.pathname) {
        case "/append":
          return await this.handleAppend(request, corsHeaders);
        case "/context":
          return await this.handleContext(request, corsHeaders);
        case "/snapshot":
          return await this.handleSnapshot(request, url, corsHeaders);
        case "/stats":
          return await this.handleStats(request, url, corsHeaders);
        case "/clear":
          return await this.handleClear(request, corsHeaders);
        default:
          return new Response("Not Found", {
            status: 404,
            headers: corsHeaders,
          });
      }
    } catch (error: unknown) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return new Response(
          JSON.stringify({
            error:
              error instanceof z.ZodError
                ? "Validation failed"
                : "Invalid JSON body",
            details: error.message,
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[session/memory] Error:", message);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }

  private async handleAppend(
    request: Request,
    headers: Record<string, string>,
  ): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers });
    }

    const body = await request.json();
    const schema = z.object({ event: MemoryEventSchema });
    const { event } = schema.parse(body);

    const result = await this.memoryStore.appendSessionMemory(event);
    return new Response(JSON.stringify({ success: result }), {
      headers: { "Content-Type": "application/json", ...headers },
    });
  }

  private async handleContext(
    request: Request,
    headers: Record<string, string>,
  ): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers });
    }

    const body = await request.json();
    const schema = z.object({
      sessionId: z.string().min(1),
      prompt: z.string(),
      limit: z.number().optional(),
    });
    const { sessionId, prompt, limit } = schema.parse(body);

    const result = await this.memoryStore.getSessionMemoryContext(
      sessionId,
      prompt,
      limit,
    );
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json", ...headers },
    });
  }

  private async handleSnapshot(
    request: Request,
    url: URL,
    headers: Record<string, string>,
  ): Promise<Response> {
    if (request.method === "GET") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId || sessionId.length === 0) {
        return new Response(JSON.stringify({ error: "sessionId required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...headers },
        });
      }
      const snapshot = await this.memoryStore.getSessionSnapshot(sessionId);
      return new Response(JSON.stringify({ snapshot }), {
        headers: { "Content-Type": "application/json", ...headers },
      });
    }

    if (request.method === "POST") {
      const body = await request.json();
      const schema = z.object({
        snapshot: MemorySnapshotSchema,
      });
      const { snapshot } = schema.parse(body);
      await this.memoryStore.upsertSessionSnapshot(snapshot);
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", ...headers },
      });
    }

    return new Response("Method Not Allowed", { status: 405, headers });
  }

  private async handleStats(
    request: Request,
    url: URL,
    headers: Record<string, string>,
  ): Promise<Response> {
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405, headers });
    }

    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "sessionId required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...headers },
      });
    }

    const stats = await this.memoryStore.getSessionMemoryStats(sessionId);
    return new Response(JSON.stringify(stats), {
      headers: { "Content-Type": "application/json", ...headers },
    });
  }

  private async handleClear(
    request: Request,
    headers: Record<string, string>,
  ): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers });
    }

    const body = await request.json();
    const { sessionId } = z.object({ sessionId: z.string().min(1) }).parse(body);

    await this.memoryStore.clearSessionMemory(sessionId);
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", ...headers },
    });
  }
}
