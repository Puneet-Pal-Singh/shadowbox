import { AIService } from "../services/AIService";
import { ExecutionService } from "../services/ExecutionService";
import { createToolRegistry } from "../orchestrator/tools";
import { Env } from "../types/ai";
import { CORS_HEADERS } from "../lib/cors";
import { convertToCoreMessages } from "ai";
import { pruneToolResults } from "@shadowbox/context-pruner";

interface ChatRequestBody {
  messages?: any[];
  sessionId?: string;
  agentId?: string;
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
        `You are Shadowbox, an autonomous expert software engineer.
        
        ### Rules:
        - PERSISTENCE: You act inside a persistent Linux sandbox (Session: ${sessionId}).
        - AUTONOMY: Be proactive. If a task requires multiple steps (e.g., create file, then run it), do them.
        - ARTIFACTS: ALWAYS use 'create_code_artifact' to write code to files.
        - EXECUTION: Use 'run_command' to execute scripts or shell commands.
        - FEEDBACK: After running a tool, analyze the output. If it failed, fix it. If it succeeded, tell the user the result.
        - EFFICIENCY: Do not use 'list_files' or 'read_file' unless you actually need to see what's there. You should keep track of what you've created.
        - STYLE: Be extremely concise. No yapping.`;

      // 3. Generate Stream
      const result = await aiService.createChatStream({
        messages,
        systemPrompt,
        tools,
        onFinish: async (finalResult) => {
          const agentId = body.agentId || "default";
          console.log(`[Brain:${correlationId}] Saving history for agent: ${agentId}`);
          
          try {
            const fullHistory = [
              ...messages,
              ...finalResult.responseMessages
            ];

            // Task 2: Prune technical noise before saving to permanent DO storage
            const prunedHistory = pruneToolResults(convertToCoreMessages(fullHistory));

            await env.SECURE_API.fetch(
              `http://internal/history?session=${sessionId}&agentId=${agentId}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: prunedHistory }),
              }
            );
          } catch (e) {
            console.error(`[Brain:${correlationId}] History Sync Failed:`, e);
          }
        }
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