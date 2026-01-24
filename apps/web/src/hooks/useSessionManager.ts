// apps/web/src/hooks/useSessionManager.ts
import { useState, useCallback } from 'react';

export interface AgentSession {
  id: string;
  name: string;
}

export function useSessionManager() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // FIX: Make 'name' optional so it doesn't conflict with React Event objects
  const createSession = useCallback((name?: string) => {
    const id = `agent-${Math.random().toString(36).substring(7)}`;
    const sessionName = typeof name === 'string' ? name : `Agent ${sessions.length + 1}`;
    
    const newSession = { id, name: sessionName };
    setSessions(prev => [...prev, newSession]);
    setActiveSessionId(id);
    return id;
  }, [sessions.length]);

  const removeSession = useCallback((id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) setActiveSessionId(null);
  }, [activeSessionId]);

  return { sessions, activeSessionId, setActiveSessionId, createSession, removeSession };
}