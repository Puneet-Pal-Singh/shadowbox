import { DurableObject } from "cloudflare:workers";
import type { DurableObjectState as LegacyDurableObjectState } from "@cloudflare/workers-types";
import { z } from "zod";
import {
  SessionMemoryStore,
  type MemoryEvent,
  type MemorySnapshot,
  MemoryEventSchema,
} from "@shadowbox/execution-engine/runtime";
import type { Env } from "../types/ai";

// Type alias for the DurableObjectState from cloudflare:workers
type DurableObjectState = ConstructorParameters<
  typeof DurableObject
>[0] extends { ctx: infer C }
  ? C
  : LegacyDurableObjectState;

const AppendEventPayloadSchema = z.object({
  event: MemoryEventSchema,
});

const GetContextPayloadSchema = z.object({
  sessionId: z.string(),
  prompt: z.string(),
  limit: z.number().optional(),
});

const GetSnapshotPayloadSchema = z.object({
  sessionId: z.string(),
});

const UpsertSnapshotPayloadSchema = z.object({
  snapshot: z.object({
    sessionId: z.string(),
    summary: z.string(),
    constraints: z.array(z.string()),
    decisions: z.array(z.string()),
    todos: z.array(z.string()),
    updatedAt: z.string(),
    version: z.number(),
    runId: z.string().optional(),
  }),
});

export class SessionMemoryRuntime extends DurableObject {
  private memoryStore: SessionMemoryStore;

  constructor(ctx: any, _env: Env) {
    super(ctx, _env);
    this.memoryStore = new SessionMemoryStore({ ctx });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      switch (url.pathname) {
        case "/append": {
          if (request.method !== "POST") {
            return new Response("Method Not Allowed", {
              status: 405,
              headers: corsHeaders,
            });
          }
          const body = await request.json();
          const { event } = AppendEventPayloadSchema.parse(body);
          const result = await this.memoryStore.appendSessionMemory(event);
          return new Response(JSON.stringify({ success: result }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        case "/context": {
          if (request.method !== "POST") {
            return new Response("Method Not Allowed", {
              status: 405,
              headers: corsHeaders,
            });
          }
          const body = await request.json();
          const { sessionId, prompt, limit } =
            GetContextPayloadSchema.parse(body);
          const result = await this.memoryStore.getSessionMemoryContext(
            sessionId,
            prompt,
            limit,
          );
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        case "/snapshot": {
          if (request.method === "GET") {
            const sessionId = url.searchParams.get("sessionId");
            if (!sessionId) {
              return new Response(
                JSON.stringify({ error: "sessionId required" }),
                {
                  status: 400,
                  headers: {
                    "Content-Type": "application/json",
                    ...corsHeaders,
                  },
                },
              );
            }
            const snapshot =
              await this.memoryStore.getSessionSnapshot(sessionId);
            return new Response(JSON.stringify({ snapshot }), {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }

          if (request.method === "POST") {
            const body = await request.json();
            const { snapshot } = UpsertSnapshotPayloadSchema.parse(body);
            await this.memoryStore.upsertSessionSnapshot(
              snapshot as MemorySnapshot,
            );
            return new Response(JSON.stringify({ success: true }), {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }

          return new Response("Method Not Allowed", {
            status: 405,
            headers: corsHeaders,
          });
        }

        case "/stats": {
          if (request.method !== "GET") {
            return new Response("Method Not Allowed", {
              status: 405,
              headers: corsHeaders,
            });
          }
          const sessionId = url.searchParams.get("sessionId");
          if (!sessionId) {
            return new Response(
              JSON.stringify({ error: "sessionId required" }),
              {
                status: 400,
                headers: { "Content-Type": "application/json", ...corsHeaders },
              },
            );
          }
          const stats = await this.memoryStore.getSessionMemoryStats(sessionId);
          return new Response(JSON.stringify(stats), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        case "/clear": {
          if (request.method !== "POST") {
            return new Response("Method Not Allowed", {
              status: 405,
              headers: corsHeaders,
            });
          }
          const body = await request.json();
          const { sessionId } = z.object({ sessionId: z.string() }).parse(body);
          await this.memoryStore.clearSessionMemory(sessionId);
          return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        default:
          return new Response("Not Found", {
            status: 404,
            headers: corsHeaders,
          });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[session/memory] Error:", message);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }
}
