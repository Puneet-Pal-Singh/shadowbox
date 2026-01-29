// apps/brain/src/index.ts
import { ChatController } from "./controllers/ChatController";
import { handleOptions, CORS_HEADERS } from "./lib/cors";
import { Env } from "./types/ai";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const optionsResponse = handleOptions(request);
    if (optionsResponse) return optionsResponse;

    const url = new URL(request.url);

    // Standardize on /api/chat
    if (url.pathname === "/api/chat" || url.pathname === "/chat") {
      try {
        return await ChatController.handle(request, env);
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    return new Response("Not Found", { 
      status: 404, 
      headers: CORS_HEADERS 
    });
  },
};