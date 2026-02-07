// apps/web/src/hooks/useSessionManager.ts
import { useState, useCallback, useEffect } from 'react';
import { agentStore } from '../store/agentStore';

export interface AgentSession {
  id: string;
  name: string;
  repository: string;
  status?: 'idle' | 'running' | 'completed' | 'error';
}

interface SavedSession {
  id: string;
  name: string;
  repository?: string;
  status?: AgentSession['status'];
}

export function useSessionManager() {
  const [sessions, setSessions] = useState<AgentSession[]>(() => {
    try {
      const saved = localStorage.getItem('shadowbox_sessions');
      const parsed: SavedSession[] = saved ? JSON.parse(saved) : [];
      
      if (!Array.isArray(parsed)) return [];

      // Migration: Add repository if missing
      return parsed.map((s) => ({
        ...s,
        repository: s.repository || 'New Project'
      })) as AgentSession[];
    } catch (e) {
      console.error("🧬 [Shadowbox] Failed to parse sessions from localStorage:", e);
      return [];
    }
  });
  
  // Persist activeSessionId to survive refreshes
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    try {
      const savedId = localStorage.getItem('shadowbox_active_id');
      const savedSessions = localStorage.getItem('shadowbox_sessions');
      const sessionsList: SavedSession[] = savedSessions ? JSON.parse(savedSessions) : [];
      
      if (!Array.isArray(sessionsList)) return null;

      // Only restore if the session still exists
      return sessionsList.some(s => s.id === savedId) ? savedId : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    localStorage.setItem('shadowbox_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem('shadowbox_active_id', activeSessionId);
    } else {
      localStorage.removeItem('shadowbox_active_id');
    }
  }, [activeSessionId]);

  // FIX: Make 'name' optional so it doesn't conflict with React Event objects
  const createSession = useCallback((name?: string, repository: string = 'New Project') => {
    const id = `agent-${Math.random().toString(36).substring(7)}`;
    const sessionName = typeof name === 'string' ? name : `Task ${sessions.length + 1}`;
    
    const newSession: AgentSession = { id, name: sessionName, repository, status: 'idle' };
    setSessions(prev => [...prev, newSession]);
    setActiveSessionId(id);
    return id;
  }, [sessions.length]);

  const removeSession = useCallback((id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    agentStore.clearMessages(id);
    if (activeSessionId === id) setActiveSessionId(null);
  }, [activeSessionId]);

  const clearAllSessions = useCallback(() => {
    setSessions([]);
    setActiveSessionId(null);
    agentStore.clearAllMessages();
    localStorage.removeItem('shadowbox_sessions');
    localStorage.removeItem('shadowbox_active_id');
  }, []);

  return { sessions, activeSessionId, setActiveSessionId, createSession, removeSession, clearAllSessions };
}