// apps/web/src/hooks/useSessionManager.ts
import { useState, useCallback, useEffect } from "react";
import { agentStore } from "../store/agentStore";

export interface AgentSession {
  id: string;
  runId: string;
  name: string;
  repository: string;
  status?: "idle" | "running" | "completed" | "error";
}

interface SavedSession {
  id: string;
  runId?: string;
  name: string;
  repository?: string;
  status?: AgentSession["status"];
}

export function useSessionManager() {
  const [sessions, setSessions] = useState<AgentSession[]>(() => {
    try {
      const saved = localStorage.getItem("shadowbox_sessions");
      const parsed: SavedSession[] = saved ? JSON.parse(saved) : [];

      if (!Array.isArray(parsed)) return [];

      // Migration: Add repository if missing
      return parsed.map((s) => ({
        ...s,
        runId: s.runId || crypto.randomUUID(),
        repository: s.repository || "New Project",
      })) as AgentSession[];
    } catch (e) {
      console.error(
        "🧬 [Shadowbox] Failed to parse sessions from localStorage:",
        e,
      );
      return [];
    }
  });

  // Persist activeSessionId to survive refreshes
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    try {
      const savedId = localStorage.getItem("shadowbox_active_id");
      const savedSessions = localStorage.getItem("shadowbox_sessions");
      const sessionsList: SavedSession[] = savedSessions
        ? JSON.parse(savedSessions)
        : [];

      if (!Array.isArray(sessionsList)) return null;

      // Only restore if the session still exists
      return sessionsList.some((s) => s.id === savedId) ? savedId : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    localStorage.setItem("shadowbox_sessions", JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem("shadowbox_active_id", activeSessionId);
    } else {
      localStorage.removeItem("shadowbox_active_id");
    }
  }, [activeSessionId]);

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

  // FIX: Make 'name' optional so it doesn't conflict with React Event objects
  const createSession = useCallback(
    (name?: string, repository: string = "New Project") => {
      const id = `agent-${Math.random().toString(36).substring(7)}`;
      const runId = crypto.randomUUID();
      const sessionName = typeof name === "string" ? name : `New Task`;

      // Ensure repository exists in the list
      setRepositories((prev) => {
        if (!prev.includes(repository)) {
          return [...prev, repository];
        }
        return prev;
      });

      const newSession: AgentSession = {
        id,
        runId,
        name: sessionName,
        repository,
        status: "idle",
      };
      setSessions((prev) => [...prev, newSession]);
      setActiveSessionId(id);
      return id;
    },
    [],
  );

  /**
   * Generate a new UUID v4 run ID for execution
   * This separates the run identifier from the session identifier
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

  const removeSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const sessionToRemove = prev.find((s) => s.id === id);
        if (sessionToRemove) {
          agentStore.clearMessages(sessionToRemove.runId);
        }
        return prev.filter((s) => s.id !== id);
      });
      if (activeSessionId === id) setActiveSessionId(null);
    },
    [activeSessionId],
  );

  const updateSession = useCallback(
    (id: string, updates: Partial<AgentSession>) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updates } : s)),
      );
    },
    [],
  );

  const clearAllSessions = useCallback(() => {
    setSessions([]);
    setActiveSessionId(null);
    setRepositories([]);
    agentStore.clearAllMessages();
    localStorage.removeItem("shadowbox_sessions");
    localStorage.removeItem("shadowbox_active_id");
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
