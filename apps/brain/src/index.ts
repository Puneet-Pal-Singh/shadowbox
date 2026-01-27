import { Env, Tool } from "./types/ai";
import { MODEL_REGISTRY } from "./registry";

// 1. Define Request/Response Contracts (DTOs)
interface ChatRequestBody {
  messages: Array<{ role: string; content: string }>;
  modelId: string;
  sessionId: string;
  apiKey?: string;
}

interface ToolsResponse {
  tools: Tool[];
}

// 2. Constant Configuration
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "http://localhost:5173", // Locked to your Frontend port
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Route: /chat
    if (request.method === "POST" && url.pathname === "/chat") {
      return handleChatRequest(request, env);
    }

    // Default 404
    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  }
};

/**
 * Controller Logic for Chat Requests
 * Separated from main fetch for readability (SRP)
 */
async function handleChatRequest(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as ChatRequestBody;
    const { messages, modelId, apiKey } = body;

    if (!messages || !modelId) {
      return new Response(JSON.stringify({ error: "Missing messages or modelId" }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }

    // 1. Dynamic Tool Discovery (Ask the Muscle what it can do)
    const toolsRes = await env.SECURE_API.fetch("http://internal/tools");
    
    if (!toolsRes.ok) {
      throw new Error(`Failed to fetch tools from Secure API: ${toolsRes.statusText}`);
    }

    const toolsData = await toolsRes.json() as ToolsResponse;
    const tools = toolsData.tools;

    // 2. Resolve Provider using Registry (Strategy Pattern)
    // We cast the key to ensure TS knows it matches the registry keys
    const modelKey = modelId as keyof typeof MODEL_REGISTRY;
    const providerFactory = MODEL_REGISTRY[modelKey];

    if (!providerFactory) {
      return new Response(JSON.stringify({ error: `Model '${modelId}' not supported` }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }

    // Instantiate the specific provider
    const provider = providerFactory(modelId, env);

    // 3. Generate Response
    const result = await provider.generate(
      messages,
      tools,
      apiKey || ""
    );

    return Response.json(result, { headers: CORS_HEADERS });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Internal Error";
    console.error("[Brain] Error:", errorMessage);
    
    return Response.json(
      { error: errorMessage }, 
      { status: 500, headers: CORS_HEADERS }
    );
  }
}