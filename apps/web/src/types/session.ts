// src/types/session.ts
export interface AgentSession {
  id: string;
  name: string;
  status: 'connecting' | 'connected' | 'error' | 'disconnected';
  createdAt: number;
}