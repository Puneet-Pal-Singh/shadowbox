// apps/web/src/hooks/useSessionManager.ts
/**
 * useSessionManager Hook
 *
 * Manages session lifecycle with v2 schema for multi-session isolation.
 * Uses SessionStateService for persistence.
 * Enforces session-scoped storage keys and run ID isolation.
 *
 * @module hooks/useSessionManager
 */

import { useState, useCallback, useEffect } from "react";
import { agentStore } from "../store/agentStore";
import type { AgentSession } from "../types/session";
import { SessionStateService } from "../services/SessionStateService";

export type { AgentSession } from "../types/session";

export function useSessionManager() {
  const [sessions, setSessions] = useState<AgentSession[]>(() => {
    const sessionsMap = SessionStateService.loadSessions();
    return Object.values(sessionsMap);
  });

  // Persist activeSessionId to survive refreshes
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    const savedId = SessionStateService.loadActiveSessionId();
    if (!savedId) return null;

    // Validate session exists
    const sessions = SessionStateService.loadSessions();
    return sessions[savedId] ? savedId : null;
  });

  // Persist sessions to localStorage with v2 schema
  useEffect(() => {
    const sessionsMap = Object.fromEntries(
      sessions.map((s) => [s.id, s]),
    );
    SessionStateService.saveSessions(sessionsMap);
  }, [sessions]);

  // Persist activeSessionId to localStorage
  useEffect(() => {
    const sessionsMap = Object.fromEntries(
      sessions.map((s) => [s.id, s]),
    );
    SessionStateService.saveActiveSessionId(activeSessionId, sessionsMap);
  }, [activeSessionId, sessions]);

  const [repositories, setRepositories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("shadowbox_repositories");
      const parsed = saved ? JSON.parse(saved) : [];

      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(
      "shadowbox_repositories",
      JSON.stringify(repositories),
    );
  }, [repositories]);

  /**
   * Create a new session with v2 schema
   * Generates initial active run ID
   */
  const createSession = useCallback(
    (name?: string, repository: string = "New Project") => {
      const sessionName = typeof name === "string" ? name : `New Task`;

      // Ensure repository exists in the list
      setRepositories((prev) => {
        if (!prev.includes(repository)) {
          return [...prev, repository];
        }
        return prev;
      });

      // Use SessionStateService to create session with proper structure
      const newSession = SessionStateService.createSession(
        sessionName,
        repository,
        "idle",
      );

      setSessions((prev) => [...prev, newSession]);
      setActiveSessionId(newSession.id);
      return newSession.id;
    },
    [],
  );

  /**
   * Generate a new UUID v4 run ID for execution
   * Note: Most use cases should use session.activeRunId instead
   */
  const generateRunId = useCallback(() => {
    return crypto.randomUUID();
  }, []);

  const addRepository = useCallback((repository: string) => {
    setRepositories((prev) => {
      if (!prev.includes(repository)) {
        return [...prev, repository];
      }
      return prev;
    });
  }, []);

  const removeRepository = useCallback(
    (repository: string) => {
      setRepositories((prev) => prev.filter((r) => r !== repository));
      // When removing a repo folder, also remove all its tasks to ensure clean state
      setSessions((prev) => {
        const sessionsToRemove = prev.filter(
          (s) => s.repository === repository,
        );
        sessionsToRemove.forEach((s) => agentStore.clearMessages(s.runId));
        const remaining = prev.filter((s) => s.repository !== repository);

        // If active session was in this repo, clear active ID
        if (
          activeSessionId &&
          sessionsToRemove.some((s) => s.id === activeSessionId)
        ) {
          setActiveSessionId(null);
        }

        return remaining;
      });
    },
    [activeSessionId],
  );

  const renameRepository = useCallback((oldName: string, newName: string) => {
    setRepositories((prev) => prev.map((r) => (r === oldName ? newName : r)));
    setSessions((prev) =>
      prev.map((s) =>
        s.repository === oldName ? { ...s, repository: newName } : s,
      ),
    );
  }, []);

  /**
   * Remove a session and clean up its state
   * Clears all runs associated with the session
   * Clears GitHub context and pending query
   */
  const removeSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const sessionToRemove = prev.find((s) => s.id === id);
        if (sessionToRemove) {
          // Clear all runs for this session
          for (const runId of sessionToRemove.runIds) {
            agentStore.clearMessages(runId);
          }
          // Clear session-scoped storage
          SessionStateService.clearSessionGitHubContext(id);
          SessionStateService.clearSessionPendingQuery(id);
        }
        return prev.filter((s) => s.id !== id);
      });
      if (activeSessionId === id) setActiveSessionId(null);
    },
    [activeSessionId],
  );

  /**
   * Update session metadata
   * Validates updates and maintains timestamps
   */
  const updateSession = useCallback(
    (id: string, updates: Partial<AgentSession>) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          // Merge updates and ensure updatedAt is fresh
          const updated = { ...s, ...updates };
          // Validate session invariants
          if (!SessionStateService.validateSession(updated)) {
            console.warn("[useSessionManager] Invalid session update:", id, updates);
            return s;
          }
          return updated;
        }),
      );
    },
    [],
  );

  /**
   * Clear all sessions and clean up storage
   * Used during logout or factory reset
   */
  const clearAllSessions = useCallback(() => {
    setSessions([]);
    setActiveSessionId(null);
    setRepositories([]);
    agentStore.clearAllMessages();
    
    // Clear v2 schema storage
    SessionStateService.saveSessions({});
    SessionStateService.saveActiveSessionId(null, {});
    
    localStorage.removeItem("shadowbox_repositories");
  }, []);

  return {
    sessions,
    activeSessionId,
    repositories,
    setActiveSessionId,
    createSession,
    removeSession,
    updateSession,
    clearAllSessions,
    addRepository,
    removeRepository,
    renameRepository,
    generateRunId,
  };
}
