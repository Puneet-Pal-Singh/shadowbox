// apps/web/src/hooks/useSessionManager.ts
import { useState, useCallback, useEffect } from 'react';
import { agentStore } from '../store/agentStore';

export interface AgentSession {
  id: string;
  name: string;
  repository: string;
  status?: 'idle' | 'running' | 'completed' | 'error';
}

export function useSessionManager() {
  const [sessions, setSessions] = useState<AgentSession[]>(() => {
    const saved = localStorage.getItem('shadowbox_sessions');
    const parsed = saved ? JSON.parse(saved) : [];
    // Migration: Add repository if missing
    return parsed.map((s: any) => ({
      ...s,
      repository: s.repository || 'New Project'
    }));
  });
  
  // NEVER persist activeSessionId across refreshes to ensure we always start at Inbox
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('shadowbox_sessions', JSON.stringify(sessions));
  }, [sessions]);

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