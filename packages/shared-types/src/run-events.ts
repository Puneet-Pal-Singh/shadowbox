/**
 * Run Events - Canonical event types and envelopes for Shadowbox runs
 * Shared contract used across web, brain, and muscle layers
 */

import { RunStatus } from "./run-status.js";

/** Event source identifier */
export type EventSource = "brain" | "muscle" | "web" | "cli" | "desktop";

/** Canonical run event types */
export const RUN_EVENT_TYPES = {
  RUN_STARTED: "run.started",
  RUN_STATUS_CHANGED: "run.status.changed",
  MESSAGE_EMITTED: "message.emitted",
  TOOL_REQUESTED: "tool.requested",
  TOOL_STARTED: "tool.started",
  TOOL_COMPLETED: "tool.completed",
  TOOL_FAILED: "tool.failed",
  RUN_COMPLETED: "run.completed",
  RUN_FAILED: "run.failed",
} as const;

export type RunEventType = (typeof RUN_EVENT_TYPES)[keyof typeof RUN_EVENT_TYPES];

/**
 * Generic event envelope structure used for all run events
 * Supports type-safe discriminated unions via TType
 */
export interface RunEventEnvelope<
  TType extends RunEventType = RunEventType,
  TPayload = unknown,
> {
  version: 1;
  eventId: string;
  runId: string;
  sessionId?: string;
  timestamp: string;
  source: EventSource;
  type: TType;
  payload: TPayload;
}

// ============================================================================
// Event Payload Definitions
// ============================================================================

export interface RunStartedPayload {
  status: Extract<RunStatus, "queued" | "running">;
}

export interface RunStatusChangedPayload {
  previousStatus: RunStatus;
  newStatus: RunStatus;
  reason?: string;
}

export interface MessageEmittedPayload {
  content: string;
  role: "user" | "assistant" | "system";
  metadata?: Record<string, unknown>;
}

export interface ToolRequestedPayload {
  toolId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface ToolStartedPayload {
  toolId: string;
  toolName: string;
}

export interface ToolCompletedPayload {
  toolId: string;
  toolName: string;
  result?: unknown;
  executionTimeMs: number;
}

export interface ToolFailedPayload {
  toolId: string;
  toolName: string;
  error: string;
  executionTimeMs: number;
}

export interface RunCompletedPayload {
  status: Extract<RunStatus, "complete">;
  totalDurationMs: number;
  toolsUsed: number;
}

export interface RunFailedPayload {
  status: Extract<RunStatus, "failed">;
  error: string;
  totalDurationMs: number;
}

// ============================================================================
// Discriminated Union Types
// ============================================================================

export type RunStartedEvent = RunEventEnvelope<
  typeof RUN_EVENT_TYPES.RUN_STARTED,
  RunStartedPayload
>;

export type RunStatusChangedEvent = RunEventEnvelope<
  typeof RUN_EVENT_TYPES.RUN_STATUS_CHANGED,
  RunStatusChangedPayload
>;

export type MessageEmittedEvent = RunEventEnvelope<
  typeof RUN_EVENT_TYPES.MESSAGE_EMITTED,
  MessageEmittedPayload
>;

export type ToolRequestedEvent = RunEventEnvelope<
  typeof RUN_EVENT_TYPES.TOOL_REQUESTED,
  ToolRequestedPayload
>;

export type ToolStartedEvent = RunEventEnvelope<
  typeof RUN_EVENT_TYPES.TOOL_STARTED,
  ToolStartedPayload
>;

export type ToolCompletedEvent = RunEventEnvelope<
  typeof RUN_EVENT_TYPES.TOOL_COMPLETED,
  ToolCompletedPayload
>;

export type ToolFailedEvent = RunEventEnvelope<
  typeof RUN_EVENT_TYPES.TOOL_FAILED,
  ToolFailedPayload
>;

export type RunCompletedEvent = RunEventEnvelope<
  typeof RUN_EVENT_TYPES.RUN_COMPLETED,
  RunCompletedPayload
>;

export type RunFailedEvent = RunEventEnvelope<
  typeof RUN_EVENT_TYPES.RUN_FAILED,
  RunFailedPayload
>;

/**
 * Discriminated union of all canonical run events
 * Use with type guards for type-safe event handling
 */
export type RunEvent =
  | RunStartedEvent
  | RunStatusChangedEvent
  | MessageEmittedEvent
  | ToolRequestedEvent
  | ToolStartedEvent
  | ToolCompletedEvent
  | ToolFailedEvent
  | RunCompletedEvent
  | RunFailedEvent;

/**
 * Type guard to check if event is a run event
 */
export function isRunEvent(value: unknown): value is RunEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.type === "string" &&
    Object.values(RUN_EVENT_TYPES).includes(obj.type as RunEventType)
  );
}

/**
 * Type guard for specific event types
 */
export function isRunEventOfType<T extends RunEventType>(
  event: RunEvent,
  type: T,
): event is Extract<RunEvent, { type: T }> {
  return event.type === type;
}
