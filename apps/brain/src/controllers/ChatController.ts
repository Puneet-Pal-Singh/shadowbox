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

      // --- NEW: Context Hydration & Pruning ---
      console.log(`[Brain:${correlationId}] Pruning and Hydrating context...`);
      
      // 1. Convert to CoreMessages first to standardize format
      const coreMessages = convertToCoreMessages(messages);

      // 2. Keep only last 2 tool results to prevent "Context Dumping"
      const toolMessages = coreMessages.filter(m => m.role === 'tool');
      const messagesToKeep = coreMessages.filter(m => {
        if (m.role !== 'tool') return true;
        const index = toolMessages.indexOf(m);
        return index >= toolMessages.length - 2;
      });

      // 3. Hydrate R2 Artifacts so the AI "remembers" the code it wrote
      const hydratedMessages = await Promise.all(messagesToKeep.map(async (msg) => {
        if (msg.role === 'assistant' && msg.toolCalls) {
          for (const call of msg.toolCalls) {
            if (call.toolName === 'create_code_artifact') {
              const args = call.args as any;
              if (args.content && typeof args.content === 'object' && args.content.type === 'r2_ref') {
                console.log(`[Brain] Hydrating artifact: ${args.content.key}`);
                try {
                  const actualContent = await executionService.getArtifact(args.content.key);
                  args.content = actualContent;
                } catch (e) {
                  console.error("[Brain] R2 Hydration failed", e);
                  args.content = "// [Error: Could not load code from cold storage]";
                }
              }
            }
          }
        }
        return msg;
      }));

      // 2. Prepare Context
      const systemPrompt = env.SYSTEM_PROMPT || 
        `You are Shadowbox, an autonomous expert software engineer.
        
        ### Rules:
        - PERSISTENCE: You act inside a persistent Linux sandbox (Session: ${sessionId}).
        - AUTONOMY: You have a 'run_command' tool. If you create or modify a file, ALWAYS run it to verify it works correctly. Do not say "I am a text model"; use your tools.
        - ARTIFACTS: ALWAYS use 'create_code_artifact' to write code to files.
        - FEEDBACK: Analyze tool outputs. If a command fails, fix the code and try again.
        - STYLE: Be extremely concise. Do not summarize previous steps unless asked.`;

      // 3. Generate Stream
      let accumulatedAssistantContent = "";
      let lastSyncTime = Date.now();

      const result = await aiService.createChatStream({
        messages: hydratedMessages,
        systemPrompt,
        tools,
        onChunk: ({ chunk }) => {
          if (chunk.type === 'text-delta') {
            accumulatedAssistantContent += chunk.textDelta;
          }
          
          // Task 5: Heartbeat Persistence (Every 5 seconds)
          const now = Date.now();
          if (now - lastSyncTime > 5000) {
            lastSyncTime = now;
            const agentId = body.agentId || "default";
            
            // Sync partial history so user doesn't lose state on refresh
            env.SECURE_API.fetch(
              `http://internal/history?session=${sessionId}&agentId=${agentId}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                  messages: [
                    ...hydratedMessages, 
                    { role: 'assistant', content: accumulatedAssistantContent + " ▌" }
                  ] 
                }),
              }
            ).catch(() => {}); // Silent fail for heartbeat
          }
        },
        onFinish: async (finalResult) => {
          const agentId = body.agentId || "default";
          console.log(`[Brain:${correlationId}] Saving history for agent: ${agentId}`);
          
          try {
            const fullHistory = [
              ...hydratedMessages,
              ...finalResult.responseMessages
            ];

            // Task 2: Prune technical noise before saving to permanent DO storage
            const prunedHistory = pruneToolResults(fullHistory);

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