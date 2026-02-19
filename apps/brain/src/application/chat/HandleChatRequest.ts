/**
 * HandleChatRequest Use-Case
 * Single Responsibility: Orchestrate chat request processing
 *
 * Handles:
 * - Request validation
 * - Service orchestration
 * - Error handling
 * - Logging
 *
 * Does NOT handle:
 * - HTTP-specific concerns (headers, status codes, response formatting)
 * - RunEngine durable object interaction (passed to caller)
 *
 * TODO: Add unit tests (HandleChatRequest.test.ts) in future cycle
 */

import type { CoreMessage } from "ai";
import type { Env } from "../../types/ai";
import { ValidationError } from "../../domain/errors";
import { PersistenceService } from "../../services/PersistenceService";
import type { AgentType } from "@shadowbox/execution-engine/runtime";

export interface HandleChatRequestInput {
  sessionId: string;
  runId: string;
  correlationId: string;
  agentType: AgentType;
  prompt: string;
  messages: CoreMessage[];
  providerId?: string;
  modelId?: string;
}

export interface HandleChatRequestOutput {
  success: boolean;
  sessionId: string;
  runId: string;
  correlationId: string;
  executionPayload: {
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
  };
}

/**
 * HandleChatRequest use-case
 */
export class HandleChatRequest {
  private persistenceService: PersistenceService;

  constructor(private env: Env) {
    this.persistenceService = new PersistenceService(env);
  }

  /**
   * Execute the chat request handling use-case
   *
   * @param input - Chat request input
   * @param requestOrigin - HTTP request origin header (for CORS)
   * @returns Execution payload for RunEngine
   * @throws ValidationError if input is invalid
   */
  async execute(
    input: HandleChatRequestInput,
    requestOrigin?: string,
  ): Promise<HandleChatRequestOutput> {
    const { sessionId, runId, correlationId, agentType, prompt, messages } =
      input;

    try {
      // Validate messages
      if (!messages || messages.length === 0) {
        throw new ValidationError(
          "No messages provided",
          "NO_MESSAGES",
          correlationId,
        );
      }

      // Extract last user message for logging
      const lastUserMessage = messages.filter((m) => m.role === "user").pop();
      if (!lastUserMessage) {
        throw new ValidationError(
          "No user message found",
          "NO_USER_MESSAGE",
          correlationId,
        );
      }

      // Persist user message (side effect)
      try {
        await this.persistenceService.persistUserMessage(
          sessionId,
          runId,
          lastUserMessage,
        );
      } catch (persistError) {
        console.warn(
          `[chat/usecase] ${correlationId}: Failed to persist user message:`,
          persistError,
        );
        // Don't fail the request if persistence fails
      }

      // Build execution payload
      const executionPayload = {
        runId,
        sessionId,
        correlationId,
        requestOrigin,
        input: {
          agentType,
          prompt,
          sessionId,
          providerId: input.providerId,
          modelId: input.modelId,
        },
        messages,
      };

      console.log(
        `[chat/usecase] ${correlationId}: Chat request prepared for RunEngine execution`,
      );

      return {
        success: true,
        sessionId,
        runId,
        correlationId,
        executionPayload,
      };
    } catch (error) {
      console.error(`[chat/usecase] ${correlationId}: Error:`, error);
      throw error;
    }
  }
}
