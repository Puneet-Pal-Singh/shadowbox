/**
 * Chat Response Events - NDJSON event stream for chat responses
 * Used by Brain to stream conversational responses back to Web
 * Implements Track 2: Event Envelope Streaming
 */

/** Chat response event types for NDJSON streaming */
export const CHAT_RESPONSE_EVENT_TYPES = {
  TEXT_DELTA: "text-delta",
  TOOL_CALL: "tool-call",
  TOOL_RESULT: "tool-result",
  TOOL_ERROR: "tool-error",
  RUN_STATUS: "run-status",
  FINAL: "final",
} as const;

export type ChatResponseEventType =
  (typeof CHAT_RESPONSE_EVENT_TYPES)[keyof typeof CHAT_RESPONSE_EVENT_TYPES];

/**
 * Base envelope for all chat response events
 * NDJSON format: one JSON object per line
 */
export interface ChatResponseEvent<
  TType extends ChatResponseEventType = ChatResponseEventType,
  TPayload = unknown,
> {
  type: TType;
  runId: string;
  timestamp: string;
  payload: TPayload;
}

// ============================================================================
// Event Payload Types
// ============================================================================

/**
 * Text delta event - streamed text content
 * Used for conversational responses and synthesis
 */
export interface TextDeltaPayload {
  content: string;
  index: number;
}

/**
 * Tool call event - LLM requested a tool execution
 */
export interface ToolCallPayload {
  toolId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  callId: string;
}

/**
 * Tool result event - tool execution completed successfully
 */
export interface ToolResultPayload {
  toolId: string;
  toolName: string;
  callId: string;
  result: unknown;
  executionTimeMs: number;
}

/**
 * Tool error event - tool execution failed
 */
export interface ToolErrorPayload {
  toolId: string;
  toolName: string;
  callId: string;
  error: string;
  executionTimeMs: number;
}

/**
 * Run status event - run state transition
 */
export interface RunStatusPayload {
  status:
    | "planning"
    | "executing"
    | "synthesizing"
    | "completed"
    | "failed"
    | "cancelled";
  reason?: string;
  taskCount?: number;
  completedTaskCount?: number;
}

/**
 * Final event - marks end of stream
 * Contains aggregate results
 */
export interface FinalPayload {
  status: "success" | "failed";
  totalDurationMs: number;
  toolCallCount: number;
  failedToolCount: number;
  message?: string;
}

// ============================================================================
// Discriminated Union Types
// ============================================================================

export type TextDeltaEvent = ChatResponseEvent<
  typeof CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA,
  TextDeltaPayload
>;

export type ToolCallEvent = ChatResponseEvent<
  typeof CHAT_RESPONSE_EVENT_TYPES.TOOL_CALL,
  ToolCallPayload
>;

export type ToolResultEvent = ChatResponseEvent<
  typeof CHAT_RESPONSE_EVENT_TYPES.TOOL_RESULT,
  ToolResultPayload
>;

export type ToolErrorEvent = ChatResponseEvent<
  typeof CHAT_RESPONSE_EVENT_TYPES.TOOL_ERROR,
  ToolErrorPayload
>;

export type RunStatusEvent = ChatResponseEvent<
  typeof CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS,
  RunStatusPayload
>;

export type FinalEvent = ChatResponseEvent<
  typeof CHAT_RESPONSE_EVENT_TYPES.FINAL,
  FinalPayload
>;

/**
 * Union of all chat response event types
 */
export type ChatResponseEventUnion =
  | TextDeltaEvent
  | ToolCallEvent
  | ToolResultEvent
  | ToolErrorEvent
  | RunStatusEvent
  | FinalEvent;

// ============================================================================
// Type Guards and Utilities
// ============================================================================

export function isChatResponseEvent(value: unknown): value is ChatResponseEventUnion {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.type === "string" &&
    Object.values(CHAT_RESPONSE_EVENT_TYPES).includes(
      obj.type as ChatResponseEventType,
    )
  );
}

export function isChatResponseEventOfType<T extends ChatResponseEventType>(
  event: ChatResponseEventUnion,
  type: T,
): event is Extract<ChatResponseEventUnion, { type: T }> {
  return event.type === type;
}

/**
 * Serialize event to NDJSON line
 */
export function serializeChatResponseEvent(
  event: ChatResponseEventUnion,
): string {
  return JSON.stringify(event);
}

/**
 * Parse NDJSON line to event
 */
export function parseChatResponseEvent(line: string): ChatResponseEventUnion {
  const parsed = JSON.parse(line);
  if (!isChatResponseEvent(parsed)) {
    throw new Error(`Invalid chat response event: ${line}`);
  }
  return parsed;
}
