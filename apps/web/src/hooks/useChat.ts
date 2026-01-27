import { useState, useCallback } from 'react';
import { ChatMessage, ActionStatus } from '../types/chat';

interface BrainResponse {
  content: string;
  toolResults?: Array<{ tool: string; result: unknown }>;
}

export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await fetch("http://localhost:8788/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content }].map(m => ({ 
            role: m.role, 
            content: m.content 
          })),
          sessionId,
          modelId: "llama-3" // This will be dynamic soon
        })
      });

      const data = await response.json() as BrainResponse;

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.content,
        executions: data.toolResults?.map(t => ({
          tool: t.tool,
          status: 'success' as ActionStatus,
          result: t.result
        })),
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      console.error("Chat Error:", e);
    } finally {
      setIsLoading(false);
    }
  }, [messages, sessionId]);

  return { messages, isLoading, sendMessage };
}