/**
 * Session Type Definitions
 *
 * Core session model for M1.3 multi-session support.
 * Follows SOLID principles: Single Responsibility for session state.
 *
 * @module types/session
 */

/**
 * Session status enum
 * Tracks the lifecycle state of a session and its active run
 */
export type SessionStatus = "idle" | "running" | "completed" | "error";

/**
 * AgentSession - Main session container
 *
 * A session represents a UI task container with one or more runs.
 * Each session has:
 * - An ID for UI identification
 * - One active run (current execution context)
 * - A list of all run IDs tied to this session
 * - Session-scoped metadata (name, repository, status)
 *
 * Key invariant: `activeRunId` MUST be in `runIds`
 */
export interface AgentSession {
  /** Unique session identifier (UI-level) */
  id: string;

  /** Session display name */
  name: string;

  /** Repository this session is tied to */
  repository: string;

  /** Active run ID within this session (execution context) */
  activeRunId: string;

  /** All run IDs associated with this session (for multi-run support) */
  runIds: string[];

  /** Current session status */
  status: SessionStatus;

  /** ISO timestamp of last update */
  updatedAt: string;
}

/**
 * Storage schema for persisting sessions
 * Used internally by SessionStateService
 */
export interface SessionStorageSchema {
  /** Version identifier for migrations */
  version: 2;

  /** All sessions keyed by session ID */
  sessions: Record<string, AgentSession>;

  /** Currently active session ID */
  activeSessionId: string | null;

  /** ISO timestamp of last modification */
  lastModified: string;
}

/**
 * GitHub context tied to a session
 * Used to restore per-session GitHub state
 */
export interface SessionGitHubContext {
  repoOwner: string;
  repoName: string;
  fullName: string;
  branch: string;
}

/**
 * Session-scoped pending query
 * Stores user input waiting to be executed
 */
export interface SessionPendingQuery {
  sessionId: string;
  query: string;
  createdAt: string;
}
