/**
 * Run Events Compatibility Layer - Maps legacy event names to canonical contract
 * Enables gradual migration from old event names to new canonical names
 */

import { RUN_EVENT_TYPES, type EventSource, type RunEvent, type RunEventType } from "./run-events.js";
import { safeParseRunEvent } from "./run-events.zod.js";

const ENABLE_LEGACY_EVENT_MAPPING = true;

/**
 * Legacy event names used in previous versions
 * These will be mapped to canonical event names
 */
export const LEGACY_EVENT_NAMES = {
  EXECUTION_STARTED: "execution_started",
  EXECUTION_COMPLETED: "execution_completed",
  EXECUTION_FAILED: "execution_failed",
  TOOL_CALLED: "tool_called",
  TOOL_COMPLETED_LEGACY: "tool_completed_legacy",
} as const;

export type LegacyEventName =
  (typeof LEGACY_EVENT_NAMES)[keyof typeof LEGACY_EVENT_NAMES];

/**
 * Map legacy event names to canonical event types
 */
const LEGACY_TO_CANONICAL: Record<LegacyEventName, RunEventType> = {
  [LEGACY_EVENT_NAMES.EXECUTION_STARTED]: RUN_EVENT_TYPES.RUN_STARTED,
  [LEGACY_EVENT_NAMES.EXECUTION_COMPLETED]: RUN_EVENT_TYPES.RUN_COMPLETED,
  [LEGACY_EVENT_NAMES.EXECUTION_FAILED]: RUN_EVENT_TYPES.RUN_FAILED,
  [LEGACY_EVENT_NAMES.TOOL_CALLED]: RUN_EVENT_TYPES.TOOL_REQUESTED,
  [LEGACY_EVENT_NAMES.TOOL_COMPLETED_LEGACY]: RUN_EVENT_TYPES.TOOL_COMPLETED,
};

/**
 * Check if a given event name is a legacy event
 */
export function isLegacyEventName(name: unknown): name is LegacyEventName {
  return (
    typeof name === "string" &&
    Object.values(LEGACY_EVENT_NAMES).includes(name as LegacyEventName)
  );
}

/**
 * Get the canonical event type for a legacy event name
 * Returns null if the event is not a legacy event
 */
export function getCanonicalEventType(name: string): RunEventType | null {
  if (isLegacyEventName(name)) {
    return LEGACY_TO_CANONICAL[name];
  }
  return null;
}

/**
 * Convert a legacy event to canonical event format
 * Transforms the event envelope and payload as needed
 *
 * @param event - Legacy event object with old event name
 * @returns Canonicalized event or null if conversion failed
 */
export function convertLegacyEvent(
  event: Record<string, unknown>,
): RunEvent | null {
  if (!ENABLE_LEGACY_EVENT_MAPPING) {
    return null;
  }

  const eventType = event.type;
  if (!isLegacyEventName(eventType)) {
    return null;
  }

  const canonicalType = LEGACY_TO_CANONICAL[eventType];

  // Log conversion for debugging
  console.warn(
    "[run-events/compat] Converting legacy event",
    eventType,
    "->",
    canonicalType,
  );

  // Build base canonical envelope
  const source = (typeof event.source === "string" && 
    ["brain", "muscle", "web", "cli", "desktop"].includes(event.source)
    ? event.source 
    : "muscle") as EventSource;

  const canonicalEvent = {
    version: 1,
    eventId: event.eventId || event.id || `legacy-${Date.now()}`,
    runId: event.runId || event.executionId || "",
    sessionId: event.sessionId,
    timestamp: event.timestamp || new Date().toISOString(),
    source,
    type: canonicalType,
    payload: transformPayload(eventType, event.payload || event.data || {}),
  };

  // Validate the constructed event matches canonical schema
  const result = safeParseRunEvent(canonicalEvent);
  if (result.success) {
    return result.data;
  }

  // If validation fails, log error and return null
  console.error(
    "[run-events/compat] Failed to convert legacy event:",
    result.error,
  );
  return null;
}

/**
 * Transform payload from legacy format to canonical format
 * Handles different payload structures based on event type
 */
function transformPayload(
  legacyType: LegacyEventName,
  payload: unknown,
): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    payload = {};
  }

  const p = payload as Record<string, unknown>;

  switch (legacyType) {
    case LEGACY_EVENT_NAMES.EXECUTION_STARTED:
      return {
        status: p.status || "running",
      };

    case LEGACY_EVENT_NAMES.EXECUTION_COMPLETED:
      return {
        status: "complete",
        totalDurationMs: (p.durationMs as number) ?? (p.totalDurationMs as number) ?? 0,
        toolsUsed: (p.toolsUsed as number) ?? 0,
      };

    case LEGACY_EVENT_NAMES.EXECUTION_FAILED:
      return {
        status: "failed",
        error: (p.error as string) || (p.message as string) || "Unknown error",
        totalDurationMs: (p.durationMs as number) ?? (p.totalDurationMs as number) ?? 0,
      };

    case LEGACY_EVENT_NAMES.TOOL_CALLED:
      return {
        toolId: (p.toolId as string) || (p.id as string) || "",
        toolName: (p.toolName as string) || (p.name as string) || "",
        arguments: (p.arguments as Record<string, unknown>) || (p.args as Record<string, unknown>) || {},
      };

    case LEGACY_EVENT_NAMES.TOOL_COMPLETED_LEGACY:
      return {
        toolId: (p.toolId as string) || (p.id as string) || "",
        toolName: (p.toolName as string) || (p.name as string) || "",
        result: p.result || p.output || null,
        executionTimeMs: (p.executionTimeMs as number) ?? (p.durationMs as number) ?? 0,
      };

    default:
      return p;
  }
}

/**
 * Normalize any event (legacy or canonical) to canonical format
 * Attempts conversion if legacy, returns as-is if already canonical
 *
 * @param event - Event object (legacy or canonical)
 * @returns Canonical RunEvent or null if normalization failed
 */
export function normalizeEvent(event: unknown): RunEvent | null {
  if (typeof event !== "object" || event === null) {
    return null;
  }

  const eventObj = event as Record<string, unknown>;

  // Try legacy conversion first if it looks like a legacy event
  if (typeof eventObj.type === "string" && isLegacyEventName(eventObj.type)) {
    const converted = convertLegacyEvent(eventObj);
    if (converted) {
      return converted;
    }
  }

  // If not legacy, validate as canonical with full schema
  const result = safeParseRunEvent(eventObj);
  if (result.success) {
    return result.data;
  }

  // Validation failed
  return null;
}
