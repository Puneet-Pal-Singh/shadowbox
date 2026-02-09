import type { RuntimeEventType } from "./context.js";

/**
 * Runtime event for context
 */
export interface RuntimeEvent {
  /** Event type */
  type: RuntimeEventType;

  /** Event payload */
  payload: unknown;

  /** Event timestamp (ms) */
  timestamp: number;

  /** Optional correlation ID */
  eventId?: string;
}

/**
 * Tool call event payload
 */
export interface ToolCallPayload {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
}

/**
 * Tool error event payload
 */
export interface ToolErrorPayload {
  toolName: string;
  toolCallId: string;
  error: string;
  retryable: boolean;
}

/**
 * Tool result event payload
 */
export interface ToolResultPayload {
  toolName: string;
  toolCallId: string;
  result: unknown;
  durationMs: number;
}

/**
 * Execution result event payload
 */
export interface ExecutionResultPayload {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
}
