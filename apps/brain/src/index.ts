import { ChatController } from "./controllers/ChatController";
import { handleOptions, CORS_HEADERS } from "./lib/cors";
import { Env } from "./types/ai";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 1. Handle Preflight
    const optionsResponse = handleOptions(request);
    if (optionsResponse) return optionsResponse;

    const url = new URL(request.url);

    // 2. Route to Chat
    if (url.pathname === "/api/chat" || url.pathname === "/chat") {
      return ChatController.handle(request, env);
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
};