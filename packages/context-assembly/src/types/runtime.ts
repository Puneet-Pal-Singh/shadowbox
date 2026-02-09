/**
 * Base runtime event properties
 */
interface RuntimeEventBase {
  /** Event timestamp (ms) */
  timestamp: number;

  /** Optional correlation ID */
  eventId?: string;
}

/**
 * Tool call event
 */
export interface ToolCallEvent extends RuntimeEventBase {
  /** Event type */
  type: "tool_call";

  /** Tool call payload */
  payload: {
    toolName: string;
    toolCallId: string;
    args: Record<string, unknown>;
  };
}

/**
 * Tool error event
 */
export interface ToolErrorEvent extends RuntimeEventBase {
  /** Event type */
  type: "tool_error";

  /** Tool error payload */
  payload: {
    toolName: string;
    toolCallId: string;
    error: string;
    retryable: boolean;
  };
}

/**
 * Tool result event
 */
export interface ToolResultEvent extends RuntimeEventBase {
  /** Event type */
  type: "tool_result";

  /** Tool result payload */
  payload: {
    toolName: string;
    toolCallId: string;
    result: unknown;
    durationMs: number;
  };
}

/**
 * Execution result event
 */
export interface ExecutionResultEvent extends RuntimeEventBase {
  /** Event type */
  type: "execution_result";

  /** Execution result payload */
  payload: {
    success: boolean;
    output?: string;
    error?: string;
    exitCode?: number;
  };
}

/**
 * User interruption event
 */
export interface UserInterruptionEvent extends RuntimeEventBase {
  /** Event type */
  type: "user_interruption";

  /** Interruption payload */
  payload: unknown;
}

/**
 * Agent switch event
 */
export interface AgentSwitchEvent extends RuntimeEventBase {
  /** Event type */
  type: "agent_switch";

  /** Agent switch payload */
  payload: unknown;
}

/**
 * Checkpoint event
 */
export interface CheckpointEvent extends RuntimeEventBase {
  /** Event type */
  type: "checkpoint";

  /** Checkpoint payload */
  payload: unknown;
}

/**
 * Runtime event discriminated union
 * Type narrows automatically based on the `type` field
 */
export type RuntimeEvent =
  | ToolCallEvent
  | ToolErrorEvent
  | ToolResultEvent
  | ExecutionResultEvent
  | UserInterruptionEvent
  | AgentSwitchEvent
  | CheckpointEvent;
