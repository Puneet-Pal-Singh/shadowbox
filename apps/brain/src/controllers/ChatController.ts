import type { CoreMessage, Message } from "ai";
import { getCorsHeaders } from "../lib/cors";
import type { AgentType } from "../types";
import type { Env } from "../types/ai";
import { PersistenceService } from "../services/PersistenceService";
import { ChatProviderSelectionSchema } from "../schemas/provider";

interface ChatRequestBody {
  messages?: Message[];
  sessionId?: string;
  agentId?: string;
  runId?: string;
  providerId?: string;
  modelId?: string;
}

interface ChatRequest {
  body: ChatRequestBody;
  correlationId: string;
  sessionId: string;
  runId: string;
}

const SAFE_IDENTIFIER_REGEX = /^[A-Za-z0-9-]+$/;
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * ChatController
 * Single Responsibility: validate request and route chat execution through RunEngine.
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

      // Validate provider/model selection if provided
      const providerSelection = ChatProviderSelectionSchema.safeParse({
        providerId: body.providerId,
        modelId: body.modelId,
      });

      if (!providerSelection.success) {
        console.warn(
          `[Brain:${correlationId}] Invalid provider/model selection:`,
          providerSelection.error.errors,
        );
        return errorResponse(req, env, "Invalid provider/model selection", 400);
      }

      if (!body.messages || !Array.isArray(body.messages)) {
        return errorResponse(req, env, "Invalid messages", 400);
      }

      const chatRequest: ChatRequest = {
        body,
        correlationId,
        sessionId: identifiers.sessionId,
        runId: identifiers.runId,
      };

      console.log(`[Brain:${correlationId}] Routing to RunEngine`);
      return await ChatController.handleWithRunEngine(req, chatRequest, env);
    } catch (error: unknown) {
      if (error instanceof RequestValidationError) {
        console.warn(`[Brain:${correlationId}] ${error.logMessage}`);
        return errorResponse(req, env, error.message, 400);
      }
      console.error(`[Brain:${correlationId}] Error:`, error);
      const errorMessage =
        error instanceof Error ? error.message : "Internal Server Error";
      return errorResponse(req, env, errorMessage, 500);
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
        ...getCorsHeaders(req, _env),
        "Content-Type": "application/json",
      },
    });
  }

  private static async handleWithRunEngine(
    req: Request,
    chatRequest: ChatRequest,
    env: Env,
  ): Promise<Response> {
    const { body, correlationId, sessionId, runId } = chatRequest;

    const coreMessages: CoreMessage[] =
      body.messages! as unknown as CoreMessage[];
    const lastUserMessage = coreMessages.filter((m) => m.role === "user").pop();

    if (!lastUserMessage) {
      return errorResponse(req, env, "No user message found", 400);
    }

    const prompt =
      typeof lastUserMessage.content === "string"
        ? lastUserMessage.content
        : JSON.stringify(lastUserMessage.content);

    const persistenceService = new PersistenceService(env);

    try {
      await persistenceService.persistUserMessage(
        sessionId,
        runId,
        lastUserMessage,
      );

      const executeInput = {
        agentType: mapAgentIdToType(body.agentId),
        prompt,
        sessionId,
        providerId: body.providerId,
        modelId: body.modelId,
      };

      const doResponse = await ChatController.executeViaRunEngineDurableObject(
        env,
        runId,
        {
          runId,
          sessionId,
          correlationId,
          requestOrigin: req.headers.get("Origin") || undefined,
          input: executeInput,
          messages: coreMessages,
        },
      );

      return withEngineHeaders(req, env, doResponse, runId);
    } catch (error) {
      console.error(`[chat/controller] RunEngine execution failed:`, error);
      throw error;
    }
  }

  private static async executeViaRunEngineDurableObject(
    env: Env,
    runId: string,
    payload: {
      runId: string;
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
  if (!SAFE_IDENTIFIER_REGEX.test(normalized)) {
    throw new RequestValidationError(
      `Invalid ${fieldName}: only letters, numbers, and hyphens are allowed`,
    );
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
  env: Env,
  message: string,
  status: number,
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...getCorsHeaders(req, env),
      "Content-Type": "application/json",
    },
  });
}

function withEngineHeaders(
  req: Request,
  env: Env,
  response: Response,
  runId: string,
): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Engine-Version", "3.0");
  headers.set("X-Run-Id", runId);
  headers.set("X-Run-Engine-Runtime", "do");

  const corsHeaders = getCorsHeaders(req, env);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

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
