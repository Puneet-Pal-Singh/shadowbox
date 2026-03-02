/**
 * SessionStatePort - Boundary for run/session state persistence.
 *
 * Abstracts session state storage (Durable Objects, databases, etc.)
 * from the core agent runtime logic.
 *
 * Canonical alignment: RunStorePort (Charter 46)
 */

export interface SessionState {
  sessionId: string;
  status: "active" | "paused" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
  runId?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionSnapshot {
  sessionId: string;
  runId: string;
  messages: unknown[];
  toolCalls: unknown[];
  state: SessionState;
  checkpoint: number;
}

/**
 * Port for managing session and run state persistence.
 * Abstracts storage platform (Durable Objects, Postgres, etc.)
 */
export interface SessionStatePort {
  /**
   * Create a new session.
   *
   * @param sessionId - Unique session identifier
   * @param runId - Associated run identifier
   * @param initialState - Initial session state
   * @returns Created session state
   */
  createSession(
    sessionId: string,
    runId: string,
    initialState?: Partial<SessionState>,
  ): Promise<SessionState>;

  /**
   * Get current session state.
   *
   * @param sessionId - Session identifier
   * @returns Session state or null if not found
   */
  getSession(sessionId: string): Promise<SessionState | null>;

  /**
   * Update session state.
   *
   * @param sessionId - Session identifier
   * @param updates - Partial state updates
   */
  updateSession(sessionId: string, updates: Partial<SessionState>): Promise<void>;

  /**
   * Persist session snapshot for recovery.
   *
   * @param snapshot - Session snapshot
   */
  saveSnapshot(snapshot: SessionSnapshot): Promise<void>;

  /**
   * Restore session from snapshot.
   *
   * @param sessionId - Session identifier
   * @returns Snapshot or null if not found
   */
  loadSnapshot(sessionId: string): Promise<SessionSnapshot | null>;

  /**
   * Delete session and clean up resources.
   *
   * @param sessionId - Session identifier
   */
  deleteSession(sessionId: string): Promise<void>;
}
