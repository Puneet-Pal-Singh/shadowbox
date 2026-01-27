import { Env, Tool, ToolCall } from "./types/ai";
import { MODEL_REGISTRY } from "./registry";
import { AgentOrchestrator } from "./orchestrator/executor";

interface ChatRequestBody {
  messages: Array<{ role: string; content: string }>;
  modelId: string;
  sessionId: string;
  apiKey?: string;
}

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
      return handleChatRequest(request, env);
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  }
};

/**
 * SRP: Autonomous Chat Controller
 */
async function handleChatRequest(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as ChatRequestBody;
    const { messages, modelId, apiKey, sessionId } = body;

    // 1. Discovery: Request tools from the Sandbox
    // We use a generic 'fetchable' to handle the type mismatch between standard/CF fetch
    console.log(`[Brain] 🧠 Discovering tools for session: ${sessionId}`);
    
    let toolsData: { tools: Tool[] };
    try {
      // Attempt A: Service Binding (Production/Internal Cloudflare Network)
      const bindingRes = await env.SECURE_API.fetch("http://muscle/tools");
      toolsData = await bindingRes.json() as { tools: Tool[] };
    } catch (e) {
      // Attempt B: Localhost Fallback (Development Mixed-Mode)
      console.log("[Brain] ⚠️ Service binding failed, trying localhost:8787...");
      const localRes = await fetch(`http://localhost:8787/tools?session=${sessionId}`);
      if (!localRes.ok) throw new Error("Could not reach Secure API via binding or localhost.");
      toolsData = await localRes.json() as { tools: Tool[] };
    }

    // 2. Select Provider
    const modelKey = modelId as keyof typeof MODEL_REGISTRY;
    const providerFactory = MODEL_REGISTRY[modelKey] || MODEL_REGISTRY["claude-4.5-sonnet"];
    const provider = providerFactory(modelId, env);

    // 3. Inference: Ask AI what to do
    const aiResponse = await provider.generate(messages, toolsData.tools, apiKey || "");

    // 4. Orchestration: Auto-Execute Tool Calls (The "Agent" Magic)
    // This allows the AI to run code without user clicking 'Run'
    const toolExecutions: Array<{ tool: string; result: unknown }> = [];
    
    if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
      const executor = new AgentOrchestrator(env, sessionId);
      
      for (const call of aiResponse.toolCalls) {
        console.log(`[Brain] ⚡️ Autonomous Execution: ${call.name}`);
        const result = await executor.executeTool(call);
        toolExecutions.push({
          tool: call.name,
          result: result
        });
      }
    }

    // 5. Final Payload
    return Response.json({
      modelId: aiResponse.modelId,
      modelName: aiResponse.modelName,
      content: aiResponse.content,
      toolResults: toolExecutions.length > 0 ? toolExecutions : undefined
    }, { headers: CORS_HEADERS });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown Brain Error";
    console.error("[Brain] ❌ Error:", msg);
    return Response.json({ error: msg }, { status: 500, headers: CORS_HEADERS });
  }
}