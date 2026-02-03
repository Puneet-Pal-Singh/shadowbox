import { createToolRegistry } from "../orchestrator/tools";
import { Env } from "../types/ai";
import { CORS_HEADERS } from "../lib/cors";
import { AIService } from "../services/AIService";
import { ExecutionService } from "../services/ExecutionService";
import { MessagePreparationService } from "../services/MessagePreparationService";
import { ContextHydrationService } from "../services/ContextHydrationService";
import { PersistenceService } from "../services/PersistenceService";
import { SystemPromptService } from "../services/SystemPromptService";
import { StreamOrchestratorService } from "../services/StreamOrchestratorService";

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
      const body = await parseRequestBody(req);
      const { sessionId, runId } = extractIdentifiers(body);

      if (!body.messages || !Array.isArray(body.messages)) {
        return errorResponse("Invalid messages", 400);
      }

      // Initialize services
      const services = initializeServices(env, sessionId, runId);

      // Prepare messages
      const prepResult = services.messagePrep.prepareMessages(body.messages);

      // Persist user message immediately
      if (prepResult.lastUserMessage) {
        await services.persistence.persistUserMessage(
          sessionId,
          runId,
          prepResult.lastUserMessage,
        );
      }

      // Hydrate and prune context for existing conversations
      let messagesForAI = prepResult.messagesForAI;
      if (!prepResult.isNewRun) {
        messagesForAI = await hydrateAndPrune(
          services.hydration,
          prepResult.messagesForAI,
        );
      }

      // Generate system prompt
      const systemPrompt = services.promptService.generatePrompt(
        runId,
        env.SYSTEM_PROMPT,
      );

      // Create and return stream
      return await services.streamOrchestrator.createStream({
        messages: messagesForAI,
        systemPrompt,
        tools: services.tools,
        correlationId,
        sessionId,
        runId,
        onChunk: () => {},
        onFinish: async (finalResult) => {
          const fullHistory = finalResult.fullMessages || [];
          await services.persistence.persistConversation(
            sessionId,
            runId,
            fullHistory,
            correlationId,
          );
        },
      });
    } catch (error: any) {
      console.error(`[Brain:${correlationId}] Error:`, error);
      return errorResponse(error.message || "Internal Server Error", 500);
    }
  }
}

async function parseRequestBody(req: Request): Promise<ChatRequestBody> {
  try {
    return (await req.json()) as ChatRequestBody;
  } catch {
    return {};
  }
}

function extractIdentifiers(body: ChatRequestBody) {
  return {
    sessionId: body.sessionId || "default",
    runId: body.runId || body.agentId || "default",
  };
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface Services {
  messagePrep: MessagePreparationService;
  hydration: ContextHydrationService;
  persistence: PersistenceService;
  promptService: SystemPromptService;
  streamOrchestrator: StreamOrchestratorService;
  tools: ReturnType<typeof createToolRegistry>;
}

function initializeServices(
  env: Env,
  sessionId: string,
  runId: string,
): Services {
  const aiService = new AIService(env);
  const executionService = new ExecutionService(env, sessionId, runId);

  return {
    messagePrep: new MessagePreparationService(),
    hydration: new ContextHydrationService(executionService),
    persistence: new PersistenceService(env),
    promptService: new SystemPromptService(),
    streamOrchestrator: new StreamOrchestratorService(aiService, env),
    tools: createToolRegistry(executionService),
  };
}

async function hydrateAndPrune(
  hydrationService: ContextHydrationService,
  messages: any[],
): Promise<any[]> {
  console.log("[Brain] Hydrating and pruning context...");
  const hydrated = await hydrationService.hydrateMessages(messages);
  return hydrationService.pruneToolResults(hydrated);
}
