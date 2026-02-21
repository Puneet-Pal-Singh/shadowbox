import type { CoreMessage } from "ai";
import type { AgentType } from "@shadowbox/execution-engine/runtime";
import { z } from "zod";
import type { Env } from "../types/ai";
import { HandleChatRequest } from "../application/chat";
import { ChatProviderSelectionSchema } from "../schemas/provider";
import {
  errorResponse,
  jsonResponse,
  withEngineHeaders,
} from "../http/response";
import {
  parseRequestBody,
  validateWithSchema,
} from "../http/validation";
import {
  ValidationError,
  isDomainError,
  mapDomainErrorToHttp,
} from "../domain/errors";
import {
  extractIdentifiers,
  mapAgentIdToType,
  parseOptionalScopeIdentifier,
} from "./chat-request-helpers";

// Zod schema for request body validation
const ChatRequestBodySchema = z.object({
  messages: z.array(z.unknown()).optional(),
  sessionId: z.string().optional(),
  agentId: z.string().optional(),
  runId: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});

type ChatRequestBody = z.infer<typeof ChatRequestBodySchema>;

interface ChatRequest {
  body: ChatRequestBody;
  correlationId: string;
  sessionId: string;
  runId: string;
  userId?: string;
  workspaceId?: string;
}

/**
 * ChatController
 * Single Responsibility: validate request and route chat execution through RunEngine.
 */
export class ChatController {
  static async handle(req: Request, env: Env): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    console.log(`[chat/request] ${correlationId} received`);

    try {
      // Parse body and validate against schema
      const rawBody = await parseRequestBody(req, correlationId);
      const body = validateWithSchema<ChatRequestBody>(
        rawBody,
        ChatRequestBodySchema,
        correlationId,
      );
      const identifiers = extractIdentifiers(body, correlationId);

      console.log(
        `[chat/request] ${correlationId} session: ${identifiers.sessionId}, run: ${identifiers.runId}`,
      );
      console.log(
        `[chat/request] ${correlationId} messages: ${body.messages?.length || 0}`,
      );

      // Validate provider/model selection if provided
      validateWithSchema(
        {
          providerId: body.providerId,
          modelId: body.modelId,
        },
        ChatProviderSelectionSchema,
        correlationId,
      );

      if (!body.messages || !Array.isArray(body.messages)) {
        throw new ValidationError(
          "Invalid messages: expected non-empty array",
          "INVALID_MESSAGES",
          correlationId,
        );
      }

      const chatRequest: ChatRequest = {
        body,
        correlationId,
        sessionId: identifiers.sessionId,
        runId: identifiers.runId,
        userId: parseOptionalScopeIdentifier(
          req.headers.get("X-User-Id"),
          "X-User-Id",
          correlationId,
        ),
        workspaceId: parseOptionalScopeIdentifier(
          req.headers.get("X-Workspace-Id"),
          "X-Workspace-Id",
          correlationId,
        ),
      };

      console.log(`[chat/request] ${correlationId} routing to RunEngine`);
      return await ChatController.handleWithRunEngine(req, chatRequest, env);
    } catch (error: unknown) {
      if (isDomainError(error)) {
        const errorCorrelationId = error.correlationId ?? correlationId;
        console.warn(
          `[chat/validation] ${errorCorrelationId}: ${error.code} - ${error.message}`,
        );
        const { status, code, message } = mapDomainErrorToHttp(error);
        return errorResponse(req, env, message, status, code);
      }
      console.error(`[chat/error] ${correlationId}:`, error);
      const errorMessage =
        error instanceof Error ? error.message : "Internal Server Error";
      return errorResponse(req, env, errorMessage, 500);
    }
  }

  static async handleAgentInfo(req: Request, env: Env): Promise<Response> {
    console.log("[chat/agent-info] returning available agent types");

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

    return jsonResponse(req, env, { agents: availableAgents });
  }

  private static async handleWithRunEngine(
    req: Request,
    chatRequest: ChatRequest,
    env: Env,
  ): Promise<Response> {
    const { body, correlationId, sessionId, runId, userId, workspaceId } =
      chatRequest;

    const coreMessages: CoreMessage[] =
      body.messages! as unknown as CoreMessage[];

    const prompt = this.extractPrompt(coreMessages, correlationId);

    try {
      const useCase = new HandleChatRequest(env);

      const useCaseResult = await useCase.execute(
        {
          sessionId,
          runId,
          userId,
          workspaceId,
          correlationId,
          agentType: mapAgentIdToType(body.agentId, correlationId),
          prompt,
          messages: coreMessages,
          providerId: body.providerId,
          modelId: body.modelId,
        },
        req.headers.get("Origin") || undefined,
      );

      const doResponse = await ChatController.executeViaRunEngineDurableObject(
        env,
        runId,
        useCaseResult.executionPayload,
      );

      return withEngineHeaders(req, env, doResponse, runId);
    } catch (error) {
      console.error(`[chat/runtime] ${correlationId}: RunEngine execution failed:`, error);
      throw error;
    }
  }

  private static extractPrompt(
    messages: CoreMessage[],
    correlationId: string,
  ): string {
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();

    if (!lastUserMessage) {
      throw new ValidationError(
        "No user message found",
        "NO_USER_MESSAGE",
        correlationId,
      );
    }

    return typeof lastUserMessage.content === "string"
      ? lastUserMessage.content
      : JSON.stringify(lastUserMessage.content);
  }

  private static async executeViaRunEngineDurableObject(
    env: Env,
    runId: string,
    payload: {
      runId: string;
      userId?: string;
      workspaceId?: string;
      sessionId: string;
      correlationId: string;
      requestOrigin?: string;
      input: {
        agentType: AgentType;
        prompt: string;
        sessionId: string;
        providerId?: string;
        modelId?: string;
      };
      messages: CoreMessage[];
    },
  ): Promise<Response> {
    if (!env.RUN_ENGINE_RUNTIME) {
      throw new Error("RUN_ENGINE_RUNTIME binding is unavailable");
    }

    const id = env.RUN_ENGINE_RUNTIME.idFromName(runId);
    const stub = env.RUN_ENGINE_RUNTIME.get(id);
    const runtimeResponse = await stub.fetch("https://run-engine/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return runtimeResponse as unknown as Response;
  }
}
