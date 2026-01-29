import { AIService } from "../services/AIService";
import { ExecutionService } from "../services/ExecutionService";
import { createToolRegistry } from "../orchestrator/tools";
import { Env } from "../types/ai";
import { CORS_HEADERS } from "../lib/cors";

interface ChatRequestBody {
  messages?: any[];
  sessionId?: string;
}

export class ChatController {
  static async handle(req: Request, env: Env): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    console.log(`[Brain:${correlationId}] Request received`);

    try {
      const body = (await req.json().catch(() => ({}))) as ChatRequestBody;
      const { messages, sessionId = "default" } = body;

      if (!messages || !Array.isArray(messages)) {
        return new Response(JSON.stringify({ error: "Invalid messages" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      // 1. Initialize Services
      const aiService = new AIService(env);
      const executionService = new ExecutionService(env, sessionId);
      const tools = createToolRegistry(executionService);

      // 2. Prepare Context
      const systemPrompt = env.SYSTEM_PROMPT || 
        `You are Shadowbox, an expert software engineer.
        - Session: ${sessionId}
        - Use 'create_code_artifact' for file modifications.
        - Be concise.`;

      // 3. Generate Stream
      const result = await aiService.createChatStream({
        messages,
        systemPrompt,
        tools,
      });

      return result.toDataStreamResponse({
        headers: CORS_HEADERS,
      });

    } catch (error: any) {
      console.error(`[Brain:${correlationId}] Error:`, error);
      return new Response(
        JSON.stringify({ 
          error: error.message || "Internal Server Error",
          id: correlationId 
        }), 
        { 
          status: 500, 
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
        }
      );
    }
  }
}