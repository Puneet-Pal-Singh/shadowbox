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
  runId?: string;
}

export class ChatController {
  static async handle(req: Request, env: Env): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    console.log(`[Brain:${correlationId}] Request received`);

    try {
      const body = (await req.json().catch(() => ({}))) as ChatRequestBody;
      const { messages, sessionId = "default", runId = body.agentId || "default" } = body;

      if (!messages || !Array.isArray(messages)) {
        return new Response(JSON.stringify({ error: "Invalid messages" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      // 1. Convert to CoreMessages first to standardize format
      const coreMessages = convertToCoreMessages(messages);

      // 0. Persist First: Save the incoming user message
      const lastMessage = coreMessages[coreMessages.length - 1];
      if (lastMessage && lastMessage.role === 'user') {
        console.log(`[Brain:${correlationId}] Persisting User Message...`);
        env.SECURE_API.fetch(
          `http://internal/chat?session=${sessionId}&runId=${runId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: lastMessage }),
          }
        ).catch(e => console.error("[Brain] Persist First failed", e));
      }

      // 1. Initialize Services
      const aiService = new AIService(env);
      const executionService = new ExecutionService(env, sessionId);
      const tools = createToolRegistry(executionService);

      // --- NEW: Context Hydration & Pruning ---
      console.log(`[Brain:${correlationId}] Pruning and Hydrating context...`);

      // 2. Context for AI: Keep the last 15 messages only
      const messagesForAI = coreMessages.length > 15 ? coreMessages.slice(-15) : coreMessages;

      // 3. Hydrate R2 Artifacts for the AI context specifically (don't mutate coreMessages)
      const hydratedMessagesForAI = await Promise.all(messagesForAI.map(async (msg) => {
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
          // Clone message and content to avoid in-place mutation of coreMessages
          const clonedMsg = { ...msg, content: [...msg.content] };
          let hasRef = false;

          for (let i = 0; i < clonedMsg.content.length; i++) {
            const part = clonedMsg.content[i];
            if (part && part.type === 'tool-call' && (part as any).toolName === 'create_code_artifact') {
              const toolPart = part as any;
              const args = { ...toolPart.args };
              if (args.content && typeof args.content === 'object' && args.content.type === 'r2_ref') {
                hasRef = true;
                console.log(`[Brain] Hydrating artifact for AI context: ${args.content.key}`);
                try {
                  const actualContent = await executionService.getArtifact(args.content.key);
                  args.content = actualContent;
                  clonedMsg.content[i] = { ...toolPart, args };
                } catch (e) {
                  console.error("[Brain] R2 Hydration failed", e);
                }
              }
            }
          }
          return hasRef ? clonedMsg : msg;
        }
        return msg;
      }));

      // --- NEW: Goldfish Pruner (Task 2) ---
      // Scan history and prune old technical noise (list_files, read_file)
      const prunedMessagesForAI = hydratedMessagesForAI.map((msg, index) => {
        // Only prune tool results that are NOT from the immediate last turn
        const isLastTurn = index >= hydratedMessagesForAI.length - 2;
        if (!isLastTurn && msg.role === 'tool') {
          return {
            ...msg,
            content: msg.content.map(part => {
              if (part.type === 'tool-result' && (part.toolName === 'run_command' || part.toolName === 'read_file')) {
                // If it's a list_files command or a large read, hide it
                const result = typeof part.result === 'string' ? part.result : JSON.stringify(part.result);
                if (result.includes('... and') || result.length > 500) {
                  return { ...part, result: "[Previous technical output hidden to prevent context bloat]" };
                }
              }
              return part;
            })
          };
        }
        return msg;
      });

      // 4. Prepare Context
      const systemPrompt = env.SYSTEM_PROMPT || 
        `You are Shadowbox, an autonomous expert software engineer.
        
        ### Rules:
        - PERSISTENCE: You act inside a persistent Linux sandbox (Session: ${sessionId}).
        - AUTONOMY: You have a 'run_command' tool. If you create or modify a file, ALWAYS run it to verify it works correctly. Do not say "I am a text model"; use your tools.
        - ARTIFACTS: ALWAYS use 'create_code_artifact' to write code to files.
        - FEEDBACK: Analyze tool outputs. If a command fails, fix the code and try again.
        - STYLE: Be extremely concise. Do not summarize previous steps unless asked.
        - CRITICAL: If you have already verified a file exists or a command has run successfully, DO NOT run it again. Move directly to answering the user.`;

      // 5. Generate Stream
      let accumulatedAssistantContent = "";
      let lastSyncTime = Date.now();

      const result = await aiService.createChatStream({
        messages: prunedMessagesForAI,
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
            
            // Sync ONLY the latest partial message to avoid DO write-lock and network bloat
            env.SECURE_API.fetch(
              `http://internal/chat?session=${sessionId}&runId=${runId}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                  message: { 
                    role: 'assistant', 
                    content: accumulatedAssistantContent + " ▌" 
                  } 
                }),
              }
            ).catch(() => {}); // Silent fail for heartbeat
          }
        },
        onFinish: async (finalResult) => {
          console.log(`[Brain:${correlationId}] Saving final history for run: ${runId}`);
          
          try {
            // Task 1: Use finalResult.fullMessages to get the complete history correctly
            const fullHistory = finalResult.fullMessages;

            // Task 2: Prune technical noise before saving
            const prunedHistory = pruneToolResults(fullHistory);

            await env.SECURE_API.fetch(
              `http://internal/chat?session=${sessionId}&runId=${runId}`,
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