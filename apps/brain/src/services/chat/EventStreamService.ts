/**
 * EventStreamService - NDJSON event stream generation for chat responses
 * Converts run execution into a sequence of ChatResponseEvents
 *
 * Track 2: Event Envelope Streaming
 */

import {
  CHAT_RESPONSE_EVENT_TYPES,
  type ChatResponseEventUnion,
  type TextDeltaEvent,
  type ToolCallEvent,
  type ToolResultEvent,
  type ToolErrorEvent,
  type RunStatusEvent,
  type FinalEvent,
} from "@repo/shared-types";

export interface EventStreamServiceConfig {
  runId: string;
  enableEventStream?: boolean;
}

/**
 * EventStreamService generates NDJSON events for streaming responses
 * Each method returns an event that can be serialized to JSON and sent to client
 */
export class EventStreamService {
  private runId: string;
  private enabled: boolean;
  private textDeltaIndex: number = 0;
  private toolCallCount: number = 0;
  private failedToolCount: number = 0;

  constructor(config: EventStreamServiceConfig) {
    this.runId = config.runId;
    this.enabled = config.enableEventStream ?? true;
  }

  /**
   * Generate text-delta event for streamed content
   */
  textDelta(content: string): TextDeltaEvent {
    return {
      type: CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA,
      runId: this.runId,
      timestamp: new Date().toISOString(),
      payload: {
        content,
        index: this.textDeltaIndex++,
      },
    };
  }

  /**
   * Generate tool-call event when LLM requests a tool
   */
  toolCall(
    toolId: string,
    toolName: string,
    arguments_: Record<string, unknown>,
    callId: string,
  ): ToolCallEvent {
    this.toolCallCount++;
    return {
      type: CHAT_RESPONSE_EVENT_TYPES.TOOL_CALL,
      runId: this.runId,
      timestamp: new Date().toISOString(),
      payload: {
        toolId,
        toolName,
        arguments: arguments_,
        callId,
      },
    };
  }

  /**
   * Generate tool-result event for successful tool execution
   */
  toolResult(
    toolId: string,
    toolName: string,
    callId: string,
    result: unknown,
    executionTimeMs: number,
  ): ToolResultEvent {
    return {
      type: CHAT_RESPONSE_EVENT_TYPES.TOOL_RESULT,
      runId: this.runId,
      timestamp: new Date().toISOString(),
      payload: {
        toolId,
        toolName,
        callId,
        result,
        executionTimeMs,
      },
    };
  }

  /**
   * Generate tool-error event for failed tool execution
   */
  toolError(
    toolId: string,
    toolName: string,
    callId: string,
    error: string,
    executionTimeMs: number,
  ): ToolErrorEvent {
    this.failedToolCount++;
    return {
      type: CHAT_RESPONSE_EVENT_TYPES.TOOL_ERROR,
      runId: this.runId,
      timestamp: new Date().toISOString(),
      payload: {
        toolId,
        toolName,
        callId,
        error,
        executionTimeMs,
      },
    };
  }

  /**
   * Generate run-status event for phase transitions
   */
  runStatus(
    status:
      | "planning"
      | "executing"
      | "synthesizing"
      | "completed"
      | "failed"
      | "cancelled",
    reason?: string,
    taskCount?: number,
    completedTaskCount?: number,
  ): RunStatusEvent {
    return {
      type: CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS,
      runId: this.runId,
      timestamp: new Date().toISOString(),
      payload: {
        status,
        reason,
        taskCount,
        completedTaskCount,
      },
    };
  }

  /**
   * Generate final event marking end of stream
   */
  final(
    status: "success" | "failed",
    totalDurationMs: number,
    message?: string,
  ): FinalEvent {
    return {
      type: CHAT_RESPONSE_EVENT_TYPES.FINAL,
      runId: this.runId,
      timestamp: new Date().toISOString(),
      payload: {
        status,
        totalDurationMs,
        toolCallCount: this.toolCallCount,
        failedToolCount: this.failedToolCount,
        message,
      },
    };
  }

  /**
   * Check if event streaming is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Reset counters (useful for testing)
   */
  reset(): void {
    this.textDeltaIndex = 0;
    this.toolCallCount = 0;
    this.failedToolCount = 0;
  }
}
