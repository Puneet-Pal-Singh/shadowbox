import { Env } from "./types/ai";
import { ChatController } from "./controllers/ChatController";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "http://localhost:5173",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
    
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/chat") {
      return ChatController.handle(request, env, CORS_HEADERS);
    }

    return new Response("Shadowbox Brain: Endpoint not found", { 
      status: 404, 
      headers: CORS_HEADERS 
    });
  }
};