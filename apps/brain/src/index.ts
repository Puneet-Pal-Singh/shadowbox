// apps/brain/src/index.ts
import { ChatController } from "./controllers/ChatController";
import { handleOptions, CORS_HEADERS } from "./lib/cors";
import { Env } from "./types/ai";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const optionsResponse = handleOptions(request);
    if (optionsResponse) return optionsResponse;

    const url = new URL(request.url);

    // Flexible routing for development
    if (url.pathname.includes("/chat")) {
      try {
        return await ChatController.handle(request, env);
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
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