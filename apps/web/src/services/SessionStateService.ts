/**
 * SessionStateService
 *
 * Single Responsibility: Manage session persistence, migrations, and state.
 * Enforces session-scoped storage keys and data model consistency.
 *
 * Storage Keys:
 * - shadowbox:sessions:v2 — Main session store
 * - shadowbox:active-session-id:v2 — Active session selector
 * - shadowbox:session-context:{sessionId} — GitHub context per session
 * - shadowbox:pending-query:{sessionId} — Pending user input per session
 * - shadowbox:run:{runId}:messages — Messages per run
 *
 * @module services/SessionStateService
 */

import type {
  AgentSession,
  SessionStatus,
  SessionStorageSchema,
  SessionGitHubContext,
} from "../types/session";

const SESSIONS_KEY = "shadowbox:sessions:v2";
const ACTIVE_SESSION_ID_KEY = "shadowbox:active-session-id:v2";

function getSessionContextKey(sessionId: string): string {
  return `shadowbox:session-context:${sessionId}`;
}

function getSessionPendingQueryKey(sessionId: string): string {
  return `shadowbox:pending-query:${sessionId}`;
}

/**
 * SessionStateService
 * Centralized persistence layer for multi-session state
 */
export class SessionStateService {
  /**
   * Load all sessions from localStorage
   * Returns empty object if not found or corrupted
   */
  static loadSessions(): Record<string, AgentSession> {
    try {
      const stored = localStorage.getItem(SESSIONS_KEY);
      if (!stored) return {};

      const parsed = JSON.parse(stored) as SessionStorageSchema;

      // Validate version (for future migrations)
      if (parsed.version !== 2) {
        console.warn(
          "[SessionStateService] Unknown version, returning empty sessions",
        );
        return {};
      }

      return parsed.sessions || {};
    } catch (e) {
      console.error("[SessionStateService] Failed to load sessions:", e);
      return {};
    }
  }

  /**
   * Save all sessions to localStorage
   * Maintains append-only invariant for messages elsewhere
   *
   * Note: Pass activeSessionId explicitly to avoid race conditions
   * where another tab updates the active session between load and save.
   */
  static saveSessions(
    sessions: Record<string, AgentSession>,
    activeSessionId: string | null = null,
  ): void {
    // Use provided activeSessionId or load current value
    // Prefer parameter to avoid race condition
    const currentActiveId =
      activeSessionId !== null ? activeSessionId : this.loadActiveSessionId();

    const schema: SessionStorageSchema = {
      version: 2,
      sessions,
      activeSessionId: currentActiveId,
      lastModified: new Date().toISOString(),
    };

    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(schema));
    } catch (e) {
      console.error("[SessionStateService] Failed to save sessions:", e);
    }
  }

  /**
   * Load the currently active session ID
   */
  static loadActiveSessionId(): string | null {
    try {
      const stored = localStorage.getItem(ACTIVE_SESSION_ID_KEY);
      return stored || null;
    } catch (e) {
      console.error("[SessionStateService] Failed to load active session ID:", e);
      return null;
    }
  }

  /**
   * Save the currently active session ID
   * Validates that the session exists before saving
   */
  static saveActiveSessionId(
    sessionId: string | null,
    sessions: Record<string, AgentSession>,
  ): void {
    // Validate session exists if setting active
    if (sessionId && !sessions[sessionId]) {
      console.warn(
        "[SessionStateService] Attempted to set non-existent session as active:",
        sessionId,
      );
      return;
    }

    try {
      if (sessionId) {
        localStorage.setItem(ACTIVE_SESSION_ID_KEY, sessionId);
      } else {
        localStorage.removeItem(ACTIVE_SESSION_ID_KEY);
      }
    } catch (e) {
      console.error("[SessionStateService] Failed to save active session ID:", e);
    }
  }

  /**
   * Load GitHub context for a specific session
   * Returns null if not found or corrupted
   */
  static loadSessionGitHubContext(
    sessionId: string,
  ): SessionGitHubContext | null {
    try {
      const key = getSessionContextKey(sessionId);
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as SessionGitHubContext) : null;
    } catch (e) {
      console.error(
        "[SessionStateService] Failed to load GitHub context for session:",
        sessionId,
        e,
      );
      return null;
    }
  }

  /**
   * Save GitHub context for a specific session
   * Enforces session-scoped storage
   */
  static saveSessionGitHubContext(
    sessionId: string,
    context: SessionGitHubContext,
  ): void {
    try {
      const key = getSessionContextKey(sessionId);
      localStorage.setItem(key, JSON.stringify(context));
    } catch (e) {
      console.error(
        "[SessionStateService] Failed to save GitHub context for session:",
        sessionId,
        e,
      );
    }
  }

  /**
   * Clear GitHub context for a specific session
   */
  static clearSessionGitHubContext(sessionId: string): void {
    try {
      const key = getSessionContextKey(sessionId);
      localStorage.removeItem(key);
    } catch (e) {
      console.error(
        "[SessionStateService] Failed to clear GitHub context for session:",
        sessionId,
        e,
      );
    }
  }

  /**
   * Load pending query for a specific session
   */
  static loadSessionPendingQuery(sessionId: string): string | null {
    try {
      const key = getSessionPendingQueryKey(sessionId);
      return localStorage.getItem(key);
    } catch (e) {
      console.error(
        "[SessionStateService] Failed to load pending query for session:",
        sessionId,
        e,
      );
      return null;
    }
  }

  /**
   * Save pending query for a specific session
   */
  static saveSessionPendingQuery(sessionId: string, query: string): void {
    try {
      const key = getSessionPendingQueryKey(sessionId);
      localStorage.setItem(key, query);
    } catch (e) {
      console.error(
        "[SessionStateService] Failed to save pending query for session:",
        sessionId,
        e,
      );
    }
  }

  /**
   * Clear pending query for a specific session
   */
  static clearSessionPendingQuery(sessionId: string): void {
    try {
      const key = getSessionPendingQueryKey(sessionId);
      localStorage.removeItem(key);
    } catch (e) {
      console.error(
        "[SessionStateService] Failed to clear pending query for session:",
        sessionId,
        e,
      );
    }
  }

  /**
   * Create a new session
   * Returns the created session
   */
  static createSession(
    name: string,
    repository: string,
    status: SessionStatus = "idle",
  ): AgentSession {
    const sessionId = crypto.randomUUID();
    const runId = crypto.randomUUID();

    return {
      id: sessionId,
      name,
      repository,
      activeRunId: runId,
      runIds: [runId],
      status,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Update session status
   * Maintains updatedAt timestamp
   */
  static updateSessionStatus(
    session: AgentSession,
    status: SessionStatus,
  ): AgentSession {
    return {
      ...session,
      status,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Add a new run to a session
   * Useful for supporting multiple runs per session in future PRs
   */
  static addRunToSession(
    session: AgentSession,
    runId: string,
    makeActive: boolean = true,
  ): AgentSession {
    if (session.runIds.includes(runId)) {
      console.warn(
        "[SessionStateService] Run already in session:",
        runId,
        session.id,
      );
      return session;
    }

    return {
      ...session,
      runIds: [...session.runIds, runId],
      activeRunId: makeActive ? runId : session.activeRunId,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Validate session invariants
   * Returns true if session is valid
   */
  static validateSession(session: AgentSession): boolean {
    const validStatuses = ["idle", "running", "completed", "error"] as const;
    const checks = [
      { name: "id", pass: !!session.id },
      { name: "name", pass: !!session.name },
      { name: "repository", pass: !!session.repository },
      { name: "activeRunId", pass: !!session.activeRunId },
      { name: "runIds", pass: Array.isArray(session.runIds) },
      {
        name: "status",
        pass: validStatuses.includes(session.status as typeof validStatuses[number]),
      },
      {
        name: "activeRunId-in-runIds",
        pass: session.runIds.includes(session.activeRunId),
      },
      { name: "updatedAt", pass: !!session.updatedAt },
    ];

    const failures = checks.filter((c) => !c.pass);
    if (failures.length > 0) {
      console.warn(
        "[SessionStateService] Validation failed for session",
        session.id,
        "Failed checks:",
        failures.map((f) => f.name),
      );
      return false;
    }

    return true;
  }
}
