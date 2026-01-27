import { useState, useCallback } from 'react';
import { ChatMessage, ChatState, ModelId } from '../types/chat';

const BRAIN_API = "http://localhost:8788/chat";

export function useChat(sessionId: string) {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    selectedModel: 'llama-3',
    apiKey: ''
  });

  const setModel = (model: ModelId) => setState(prev => ({ ...prev, selectedModel: model }));
  const setApiKey = (key: string) => setState(prev => ({ ...prev, apiKey: key }));

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    // 1. Optimistic UI Update
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now()
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMsg],
      isLoading: true
    }));

    try {
      // 2. Call the Brain
      const response = await fetch(BRAIN_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "You are a helpful coding assistant." },
            ...state.messages.map(m => ({ role: m.role, content: m.content })),
            { role: "user", content }
          ],
          sessionId, // Critical: Connects Brain to the specific Sandbox ID
          modelId: state.selectedModel,
          apiKey: state.apiKey
        })
      });

      if (!response.ok) {
        throw new Error(`Brain API Error: ${response.statusText}`);
      }

      // 3. Handle Response
      // Define a strict type for the API response instead of 'any'
      interface BrainResponse {
        content: string;
        toolResults?: Array<{ tool: string; result: unknown }>;
      }
      
      const data = await response.json() as BrainResponse;

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.content,
        timestamp: Date.now(),
        toolResults: data.toolResults
      };

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, aiMsg]
      }));

    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : "Unknown error occurred";
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'system',
        content: `Error: ${errMsg}`,
        timestamp: Date.now()
      };
      setState(prev => ({ ...prev, messages: [...prev.messages, errorMsg] }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [state.messages, state.selectedModel, state.apiKey, sessionId]);

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    selectedModel: state.selectedModel,
    apiKey: state.apiKey,
    setModel,
    setApiKey,
    sendMessage
  };
}