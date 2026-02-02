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
      const {
        messages,
        sessionId = "default",
        agentId,
        runId: bodyRunId,
      } = body;

      const runId = bodyRunId || agentId || "default";

      if (!messages || !Array.isArray(messages)) {
        return new Response(JSON.stringify({ error: "Invalid messages" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      // 1. Convert to CoreMessages first to standardize format
      const coreMessages = convertToCoreMessages(messages);

      // --- NEW: Fresh Start Guard ---
      const isNewRun = coreMessages.length <= 1; // 1 because user message was just added

      // 0. Persist First: Save the incoming user message
      const lastMessage = coreMessages[coreMessages.length - 1];
      if (lastMessage && lastMessage.role === "user") {
        console.log(`[Brain:${correlationId}] Persisting User Message...`);
        env.SECURE_API.fetch(
          `http://internal/chat?session=${sessionId}&runId=${runId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: lastMessage }),
          },
        ).catch((e) => console.error("[Brain] Persist First failed", e));
      }

      // 1. Initialize Services
      const aiService = new AIService(env);
      const executionService = new ExecutionService(env, sessionId, runId);
      const tools = createToolRegistry(executionService);
      let messagesForAI = coreMessages;

      if (!isNewRun) {
        // --- NEW: Context Hydration & Pruning ---
        console.log(
          `[Brain:${correlationId}] Pruning and Hydrating context...`,
        );

        // 2. Context for AI: Keep the last 15 messages only
        const slicedMessages =
          coreMessages.length > 15 ? coreMessages.slice(-15) : coreMessages;

        // 3. Hydrate R2 Artifacts for the AI context specifically (don't mutate coreMessages)
        const hydratedMessages = await Promise.all(
          slicedMessages.map(async (msg) => {
            if (msg.role === "assistant" && Array.isArray(msg.content)) {
              // Clone message and content to avoid in-place mutation of coreMessages
              const clonedMsg = { ...msg, content: [...msg.content] };
              let hasRef = false;

              for (let i = 0; i < clonedMsg.content.length; i++) {
                const part = clonedMsg.content[i];
                if (
                  part &&
                  part.type === "tool-call" &&
                  (part as any).toolName === "create_code_artifact"
                ) {
                  const toolPart = part as any;
                  const args = { ...toolPart.args };
                  if (
                    args.content &&
                    typeof args.content === "object" &&
                    args.content.type === "r2_ref"
                  ) {
                    hasRef = true;
                    console.log(
                      `[Brain] Hydrating artifact for AI context: ${args.content.key}`,
                    );
                    try {
                      const actualContent = await executionService.getArtifact(
                        args.content.key,
                      );
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
          }),
        );

        // --- NEW: Goldfish Pruner (Task 2) ---
        // Scan history and prune old technical noise (list_files, read_file)
        messagesForAI = hydratedMessages.map((msg, index) => {
          // Only prune tool results that are NOT from the immediate last turn
          const isLastTurn = index >= hydratedMessages.length - 2;
          if (!isLastTurn && msg.role === "tool") {
            return {
              ...msg,
              content: msg.content.map((part) => {
                if (
                  part.type === "tool-result" &&
                  (part.toolName === "run_command" ||
                    part.toolName === "read_file")
                ) {
                  // If it's a list_files command or a large read, hide it
                  const result =
                    typeof part.result === "string"
                      ? part.result
                      : JSON.stringify(part.result);
                  if (result.includes("... and") || result.length > 500) {
                    return {
                      ...part,
                      result:
                        "[Previous technical output hidden to prevent context bloat]",
                    };
                  }
                }
                return part;
              }),
            };
          }
          return msg;
        });
      }

      // 4. Prepare Context
      const systemPrompt =
        env.SYSTEM_PROMPT ||
        `You are Shadowbox, an autonomous expert software engineer.
                    
                    ### Rules:
                    - PERSISTENCE: You act inside a persistent Linux sandbox.
                    - ISOLATION: You are locked in a dedicated workspace folder (/home/sandbox/workspaces/${runId}). You cannot see other tasks.
                    - REACTIVE: Do NOT write any code or run any tools unless EXPLICITLY instructed by the current user message.
                    - NO AUTONOMY: Never create files, run commands, or use tools unless the user specifically asks you to. Just answer questions directly.
                    - ARTIFACTS: ONLY use 'create_code_artifact' when the user asks you to write code or create files.
                    - FEEDBACK: Analyze tool outputs. If a command fails, fix the code and try again.
                    - STYLE: Be extremely concise. Answer directly. Do not create example code unless asked.
                    - FRESH START: You are starting a fresh task. Do not refer to previous work unless it is in the current directory.
                    - CRITICAL: For simple questions like "hello" or "how are you", just respond conversationally. NEVER create files for casual chat.`;
      // 5. Generate Stream
      let accumulatedAssistantContent = "";
      let lastSyncTime = Date.now();

      console.log(
        `[Brain:${correlationId}] Starting AI stream with ${messagesForAI.length} messages`,
      );

      const result = await aiService.createChatStream({
        messages: messagesForAI,
        systemPrompt,
        tools,
        onChunk: ({ chunk }) => {
          console.log(
            `[Brain:${correlationId}] Chunk:`,
            chunk.type,
            chunk.type === "text-delta"
              ? chunk.textDelta?.substring(0, 20)
              : "",
          );
          if (chunk.type === "text-delta") {
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
                    role: "assistant",
                    content: accumulatedAssistantContent + " ▌",
                  },
                }),
              },
            ).catch(() => {}); // Silent fail for heartbeat
          }
        },
        onFinish: async (finalResult) => {
          console.log(
            `[Brain:${correlationId}] Saving final history for run: ${runId}`,
          );

          try {
            // Task 1: Use fullMessages safely
            const fullHistory = finalResult.fullMessages || [];

            // Task 2: Prune technical noise before saving
            const prunedHistory = pruneToolResults(fullHistory);

            if (prunedHistory.length > 0) {
              await env.SECURE_API.fetch(
                `http://internal/chat?session=${sessionId}&runId=${runId}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ messages: prunedHistory }),
                },
              );
            }
          } catch (e) {
            console.error(`[Brain:${correlationId}] History Sync Failed:`, e);
          }
        },
      });
      return result.toDataStreamResponse({
        headers: CORS_HEADERS,
      });
    } catch (error: any) {
      console.error(`[Brain:${correlationId}] Error:`, error);
      return new Response(
        JSON.stringify({
          error: error.message || "Internal Server Error",
          id: correlationId,
        }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }
  }
}
