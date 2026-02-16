// Git types
export type {
  FileStatusType,
  FileStatus,
  DiffLine,
  DiffHunk,
  DiffContent,
  CommitPayload,
  GitStatusResponse,
  GitDiffRequest,
  StageFilesRequest,
} from "./git.js";

// Run status types
export { RUN_STATUSES } from "./run-status.js";
export type { RunStatus } from "./run-status.js";

// Run event types
export {
  RUN_EVENT_TYPES,
  type EventSource,
  type RunEventType,
  type RunEventEnvelope,
  isRunEvent,
  isRunEventOfType,
  // Event types
  type RunStartedEvent,
  type RunStatusChangedEvent,
  type MessageEmittedEvent,
  type ToolRequestedEvent,
  type ToolStartedEvent,
  type ToolCompletedEvent,
  type ToolFailedEvent,
  type RunCompletedEvent,
  type RunFailedEvent,
  type RunEvent,
  // Payload types
  type RunStartedPayload,
  type RunStatusChangedPayload,
  type MessageEmittedPayload,
  type ToolRequestedPayload,
  type ToolStartedPayload,
  type ToolCompletedPayload,
  type ToolFailedPayload,
  type RunCompletedPayload,
  type RunFailedPayload,
} from "./run-events.js";

// Zod validation
export {
  parseRunEvent,
  safeParseRunEvent,
  validateEventEnvelope,
  getEventPayloadSchema,
} from "./run-events.zod.js";

// Compatibility layer
export {
  LEGACY_EVENT_NAMES,
  isLegacyEventName,
  getCanonicalEventType,
  convertLegacyEvent,
  normalizeEvent,
} from "./run-events.compat.js";
