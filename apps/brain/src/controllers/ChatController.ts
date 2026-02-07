import type { CoreMessage, CoreTool, Message } from "ai";
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
  messages?: Message[];
  sessionId?: string;
  agentId?: string;
  runId?: string;
}

interface ChatRequest {
  body: ChatRequestBody;
  correlationId: string;
  sessionId: string;
  runId: string;
}

/**
 * ChatController
 * Orchestrates the chat flow across multiple services
 * Single Responsibility: Coordinate request handling and service composition
 */
export class ChatController {
  static async handle(req: Request, env: Env): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    console.log(`[Brain:${correlationId}] Request received`);

    try {
      const body = await parseRequestBody(req);
      const identifiers = extractIdentifiers(body);

      console.log(`[Brain:${correlationId}] Incoming request for session: ${identifiers.sessionId}, run: ${identifiers.runId}`);
      console.log(`[Brain:${correlationId}] Messages count in request: ${body.messages?.length || 0}`);

      if (!body.messages || !Array.isArray(body.messages)) {
        return errorResponse("Invalid messages", 400);
      }

      const chatRequest: ChatRequest = {
        body,
        correlationId,
        sessionId: identifiers.sessionId,
        runId: identifiers.runId,
      };

      return await this.handleChatRequest(chatRequest, env);
    } catch (error: unknown) {
      console.error(`[Brain:${correlationId}] Error:`, error);
      const errorMessage =
        error instanceof Error ? error.message : "Internal Server Error";
      return errorResponse(errorMessage, 500);
    }
  }

  private static async handleChatRequest(
    chatRequest: ChatRequest,
    env: Env,
  ): Promise<Response> {
    const { body, correlationId, sessionId, runId } = chatRequest;

    // Initialize services
    const services = initializeServices(env, sessionId, runId);

    // Prepare messages
    const prepResult = services.messagePrep.prepareMessages(body.messages!);

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
      body.agentId, // Use agentId as custom prompt if needed, or similar logic
    );

    // Create tools registry
    const toolsRegistry = services.tools;

    // Create and return stream
    return await services.streamOrchestrator.createStream({
      messages: messagesForAI,
      fullHistory: prepResult.coreMessages,
      systemPrompt,
      tools: toolsRegistry,
      correlationId,
      sessionId,
      runId,
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
  messages: CoreMessage[],
): Promise<CoreMessage[]> {
  console.log("[Brain] Hydrating and pruning context...");
  const hydrated = await hydrationService.hydrateMessages(messages);
  return hydrationService.pruneToolResults(hydrated);
}
