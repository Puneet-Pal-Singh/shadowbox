// apps/brain/src/index.ts
import { ChatController } from "./controllers/ChatController";
import { GitController } from "./controllers/GitController";
import { handleOptions, CORS_HEADERS } from "./lib/cors";
import { Env } from "./types/ai";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const optionsResponse = handleOptions(request);
    if (optionsResponse) return optionsResponse;

    const url = new URL(request.url);

    // Git routes
    if (url.pathname.includes("/api/git/status")) {
      try {
        return await GitController.getStatus(request, env);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    if (url.pathname.includes("/api/git/diff")) {
      try {
        return await GitController.getDiff(request, env);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    if (url.pathname.includes("/api/git/stage") && request.method === "POST") {
      try {
        return await GitController.stageFiles(request, env);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    if (url.pathname.includes("/api/git/unstage") && request.method === "POST") {
      try {
        return await GitController.stageFiles(request, env);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    if (url.pathname.includes("/api/git/commit") && request.method === "POST") {
      try {
        return await GitController.commit(request, env);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    // Chat routes
    if (url.pathname.includes("/chat")) {
      try {
        return await ChatController.handle(request, env);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not Found", path: url.pathname }), { 
      status: 404, 
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  },
};