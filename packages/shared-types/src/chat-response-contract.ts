/**
 * Chat Response Contract - Frozen DTOs for v1 response protocol
 *
 * Implements Track 4: Provider Parity and Freeze
 * Guarantees consistent response format across all providers
 */

import { z } from "zod";
import { CHAT_RESPONSE_EVENT_TYPES } from "./chat-response-events.js";

/**
 * Version marker for response protocol
 * Increment on breaking changes only
 */
export const CHAT_RESPONSE_PROTOCOL_VERSION = 1;

/**
 * Zod schemas for strict validation across all providers
 * These are the canonical frozen DTOs
 */

export const TextDeltaPayloadSchema = z.object({
  content: z.string().min(1).describe("Text chunk content"),
  index: z.number().int().min(0).describe("Zero-based chunk index"),
}).strict();

export const ToolCallPayloadSchema = z.object({
  toolId: z.string().min(1).describe("Unique tool identifier"),
  toolName: z.string().min(1).describe("Human-readable tool name"),
  arguments: z
    .record(z.unknown())
    .describe("Tool invocation arguments"),
  callId: z.string().min(1).describe("Unique call identifier for tracking"),
}).strict();

export const ToolResultPayloadSchema = z.object({
  toolId: z.string().min(1),
  toolName: z.string().min(1),
  callId: z.string().min(1),
  result: z.unknown().describe("Tool execution result"),
  executionTimeMs: z
    .number()
    .int()
    .min(0)
    .describe("Wall-clock execution time"),
}).strict();

export const ToolErrorPayloadSchema = z.object({
  toolId: z.string().min(1),
  toolName: z.string().min(1),
  callId: z.string().min(1),
  error: z.string().min(1).describe("Error message from tool"),
  executionTimeMs: z.number().int().min(0),
}).strict();

export const RunStatusPayloadSchema = z.object({
  status: z.enum([
    "planning",
    "executing",
    "synthesizing",
    "completed",
    "failed",
    "cancelled",
  ]),
  reason: z.string().optional().describe("Human-readable status reason"),
  taskCount: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Total planned tasks"),
  completedTaskCount: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Completed task count"),
}).strict();

export const FinalPayloadSchema = z.object({
  status: z.enum(["success", "failed"]).describe("Final outcome"),
  totalDurationMs: z
    .number()
    .int()
    .min(0)
    .describe("Total run duration"),
  toolCallCount: z.number().int().min(0).describe("Total tool calls"),
  failedToolCount: z
    .number()
    .int()
    .min(0)
    .describe("Failed tool count"),
  message: z.string().optional().describe("Optional summary message"),
}).strict();

// Event envelope schema
export const ChatResponseEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA),
    runId: z.string().min(1),
    timestamp: z.string().datetime(),
    payload: TextDeltaPayloadSchema,
  }).strict(),
  z.object({
    type: z.literal(CHAT_RESPONSE_EVENT_TYPES.TOOL_CALL),
    runId: z.string().min(1),
    timestamp: z.string().datetime(),
    payload: ToolCallPayloadSchema,
  }).strict(),
  z.object({
    type: z.literal(CHAT_RESPONSE_EVENT_TYPES.TOOL_RESULT),
    runId: z.string().min(1),
    timestamp: z.string().datetime(),
    payload: ToolResultPayloadSchema,
  }).strict(),
  z.object({
    type: z.literal(CHAT_RESPONSE_EVENT_TYPES.TOOL_ERROR),
    runId: z.string().min(1),
    timestamp: z.string().datetime(),
    payload: ToolErrorPayloadSchema,
  }).strict(),
  z.object({
    type: z.literal(CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS),
    runId: z.string().min(1),
    timestamp: z.string().datetime(),
    payload: RunStatusPayloadSchema,
  }).strict(),
  z.object({
    type: z.literal(CHAT_RESPONSE_EVENT_TYPES.FINAL),
    runId: z.string().min(1),
    timestamp: z.string().datetime(),
    payload: FinalPayloadSchema,
  }).strict(),
]);

export type ChatResponseEvent = z.infer<typeof ChatResponseEventSchema>;

/**
  * Validate event conforms to contract
  */
export function validateChatResponseEvent(
  event: unknown,
): event is ChatResponseEvent {
  return ChatResponseEventSchema.safeParse(event).success;
}

/**
 * Parse and validate event
 * Throws on invalid event
 */
export function parseChatResponseEvent(event: unknown): ChatResponseEvent {
  return ChatResponseEventSchema.parse(event);
}

/**
 * Safe parse with error details
 */
export function safeParseChatResponseEvent(
  event: unknown,
): { success: true; data: ChatResponseEvent } | { success: false; error: string } {
  const result = ChatResponseEventSchema.safeParse(event);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}
