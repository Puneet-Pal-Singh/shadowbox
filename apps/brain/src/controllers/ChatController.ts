import type { CoreMessage, CoreTool, Message } from "ai";
import { createToolRegistry } from "../orchestrator/tools";
import { Env } from "../types/ai";
import { getCorsHeaders } from "../lib/cors";
import { AIService } from "../services/AIService";
import { ExecutionService } from "../services/ExecutionService";
import { MessagePreparationService } from "../services/MessagePreparationService";
import { ContextHydrationService } from "../services/ContextHydrationService";
import { PersistenceService } from "../services/PersistenceService";
import { SystemPromptService } from "../services/SystemPromptService";
import { StreamOrchestratorService } from "../services/StreamOrchestratorService";
import type { AgentType } from "../types";
import { getFeatureFlags, shouldUseRunEngine } from "../config/features";
import { RunEngine } from "../core/engine/RunEngine";
import { createKVBackedDurableObjectState } from "../core/state/KVBackedDurableObjectState";

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
 *
 * Phase 3 Enhancement: Added RunEngine integration with feature flag routing
 * - Uses RunEngine when USE_RUN_ENGINE flag is enabled
 * - Falls back to StreamOrchestratorService for backward compatibility
 * - Supports gradual rollout via traffic percentage
 */
export class ChatController {
  static async handle(req: Request, env: Env): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    console.log(`[Brain:${correlationId}] Request received`);

    try {
      const body = await parseRequestBody(req);
      const identifiers = extractIdentifiers(body);

      console.log(
        `[Brain:${correlationId}] Incoming request for session: ${identifiers.sessionId}, run: ${identifiers.runId}`,
      );
      console.log(
        `[Brain:${correlationId}] Messages count in request: ${body.messages?.length || 0}`,
      );

      if (!body.messages || !Array.isArray(body.messages)) {
        return errorResponse(req, "Invalid messages", 400);
      }

      const chatRequest: ChatRequest = {
        body,
        correlationId,
        sessionId: identifiers.sessionId,
        runId: identifiers.runId,
      };

      // Phase 3: Check feature flags for RunEngine routing
      const features = getFeatureFlags(
        env as unknown as Record<string, unknown>,
      );
      const useRunEngine = shouldUseRunEngine(
        features,
        body.agentId || "default",
      );

      if (useRunEngine) {
        console.log(`[Brain:${correlationId}] Routing to RunEngine (Phase 3)`);
        return await ChatController.handleWithRunEngine(req, chatRequest, env);
      } else {
        console.log(
          `[Brain:${correlationId}] Routing to legacy StreamOrchestrator`,
        );
        return await ChatController.handleLegacy(req, chatRequest, env);
      }
    } catch (error: unknown) {
      if (error instanceof RequestValidationError) {
        console.warn(`[Brain:${correlationId}] ${error.logMessage}`);
        return errorResponse(req, error.message, 400);
      }
      console.error(`[Brain:${correlationId}] Error:`, error);
      const errorMessage =
        error instanceof Error ? error.message : "Internal Server Error";
      return errorResponse(req, errorMessage, 500);
    }
  }

  static async handleAgentInfo(req: Request, _env: Env): Promise<Response> {
    console.log("[chat/agent-info] Returning available agent types");

    const availableAgents = [
      {
        type: "coding" as AgentType,
        capabilities: [
          { name: "code_generation", description: "Generate and modify code" },
          {
            name: "file_operations",
            description: "Read, write, and manage files",
          },
          { name: "shell_execution", description: "Execute shell commands" },
        ],
      },
      {
        type: "review" as AgentType,
        capabilities: [
          {
            name: "code_review",
            description: "Review code for quality and issues",
          },
          {
            name: "security_audit",
            description: "Check for security vulnerabilities",
          },
        ],
      },
    ];

    return new Response(JSON.stringify({ agents: availableAgents }), {
      headers: {
        ...getCorsHeaders(req),
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Phase 3: Handle chat request using new RunEngine
   * Provides explicit planning, task orchestration, and better visibility
   */
  private static async handleWithRunEngine(
    req: Request,
    chatRequest: ChatRequest,
    env: Env,
  ): Promise<Response> {
    const { body, correlationId, sessionId, runId } = chatRequest;

    // Convert messages to CoreMessage format
    // Cast to CoreMessage to preserve all valid roles (system, user, assistant, tool)
    const coreMessages: CoreMessage[] =
      body.messages! as unknown as CoreMessage[];

    // Get last user message as the prompt
    const lastUserMessage = coreMessages.filter((m) => m.role === "user").pop();

    if (!lastUserMessage) {
      return errorResponse(req, "No user message found", 400);
    }

    const prompt =
      typeof lastUserMessage.content === "string"
        ? lastUserMessage.content
        : JSON.stringify(lastUserMessage.content);

    const durableState = createKVBackedDurableObjectState(
      env.SESSIONS,
      `${sessionId}:${runId}`,
    );
    const runEngine = new RunEngine(durableState, {
      env,
      sessionId,
      runId,
      correlationId,
      requestOrigin: req.headers.get("Origin") || undefined,
    });

    try {
      // Execute using RunEngine
      const response = await runEngine.execute(
        {
          agentType: mapAgentIdToType(body.agentId),
          prompt,
          sessionId,
        },
        coreMessages,
        {}, // Tools are handled internally by RunEngine in Phase 3B
      );

      // Add engine version and CORS headers
      const headers = new Headers(response.headers);
      headers.set("X-Engine-Version", "3.0");
      headers.set("X-Run-Id", runId);

      // Add CORS headers as required by AGENTS.md
      const corsHeaders = getCorsHeaders(req);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.error(`[chat/controller] RunEngine execution failed:`, error);
      throw error;
    }
  }

  /**
   * Legacy handler using StreamOrchestratorService
   * Preserved for backward compatibility during gradual rollout
   */
  private static async handleLegacy(
    req: Request,
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
      body.agentId,
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
      requestOrigin: req.headers.get("Origin") || undefined,
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
  const sessionId = parseRequiredIdentifier(body.sessionId, "sessionId");
  const runId = parseRunId(body.runId);

  return {
    sessionId,
    runId,
    agentType: mapAgentIdToType(body.agentId),
  };
}

function parseRunId(runId?: string): string {
  if (!runId || runId.trim().length === 0) {
    return crypto.randomUUID();
  }
  const normalized = runId.trim();
  if (!UUID_V4_REGEX.test(normalized)) {
    throw new RequestValidationError(
      "Invalid runId. Expected a UUID v4 string.",
    );
  }
  return normalized;
}

function parseRequiredIdentifier(
  identifier: string | undefined,
  fieldName: string,
): string {
  if (!identifier || identifier.trim().length === 0) {
    throw new RequestValidationError(`Missing required field: ${fieldName}`);
  }

  const normalized = identifier.trim();
  if (normalized.length > 128) {
    throw new RequestValidationError(`Invalid ${fieldName}: too long`);
  }
  return normalized;
}

function mapAgentIdToType(agentId?: string): AgentType {
  if (!agentId) return "coding";

  const agentTypeMap: Record<string, AgentType> = {
    review: "review",
    ci: "ci",
    coding: "coding",
  };

  return agentTypeMap[agentId] ?? "coding";
}

function errorResponse(
  req: Request,
  message: string,
  status: number,
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class RequestValidationError extends Error {
  public readonly logMessage: string;

  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
    this.logMessage = `[chat/validation] ${message}`;
  }

  toString(): string {
    return this.logMessage;
  }
}
