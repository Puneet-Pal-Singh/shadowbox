import type { CoreMessage } from "ai";
import type { AgentType } from "@shadowbox/execution-engine/runtime";
import type { Env } from "../types/ai";
import {
  DomainError,
  ValidationError,
  isDomainError,
} from "../domain/errors";
import {
  parseOptionalScopeIdentifier,
} from "./chat-request-helpers";
import { extractSessionToken } from "../services/AuthService";
import { resolveAuthorizedProviderScope } from "./provider/ProviderAuthScopeService";

export interface ExecutionScope {
  userId?: string;
  workspaceId?: string;
}

export interface RunEngineExecutionPayload {
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
}

export function extractPromptFromMessages(
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

  const extractedText = extractTextFromMessageContent(lastUserMessage.content);
  if (extractedText.length > 0) {
    return extractedText;
  }

  return safeStringify(lastUserMessage.content);
}

function extractTextFromMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const parts = content
      .map((part) => extractTextFromPart(part))
      .filter((part) => part.length > 0);
    return parts.join("\n").trim();
  }

  return extractTextFromPart(content);
}

function extractTextFromPart(part: unknown): string {
  if (typeof part === "string") {
    return part;
  }

  if (!part || typeof part !== "object") {
    return "";
  }

  const record = part as Record<string, unknown>;

  if (record.type === "text" && typeof record.text === "string") {
    return record.text;
  }

  if (typeof record.text === "string") {
    return record.text;
  }

  if (typeof record.content === "string") {
    return record.content;
  }

  return "";
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export async function resolveExecutionScope(
  req: Request,
  env: Env,
  runId: string,
  correlationId: string,
): Promise<ExecutionScope> {
  // Keep chat usable for non-auth local/dev flows.
  const unauthenticatedScope = {
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

  const sessionToken = extractSessionToken(req);
  if (!sessionToken) {
    return unauthenticatedScope;
  }

  const scopeHeaders = new Headers(req.headers);
  scopeHeaders.set("X-Run-Id", runId);
  const scopedRequest = new Request(req.url, {
    method: req.method,
    headers: scopeHeaders,
  });

  try {
    const scope = await resolveAuthorizedProviderScope(
      scopedRequest,
      env,
      correlationId,
    );
    return {
      userId: scope.userId,
      workspaceId: scope.workspaceId,
    };
  } catch (error) {
    if (isDomainError(error)) {
      throw error;
    }
    throw new DomainError(
      "AUTH_FAILED",
      "Failed to resolve authenticated execution scope.",
      401,
      false,
      correlationId,
    );
  }
}

export async function executeViaRunEngineDurableObject(
  env: Env,
  runId: string,
  payload: RunEngineExecutionPayload,
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
