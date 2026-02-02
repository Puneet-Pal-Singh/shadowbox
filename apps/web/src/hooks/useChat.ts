import { useChat as useVercelChat } from "@ai-sdk/react";
import { useState, useEffect } from "react";
import { agentStore } from "../store/agentStore";

// Define the shape of our artifact
export interface ArtifactData {
  path: string;
  content: string;
}

export function useChat(sessionId: string, runId: string = "default", onFileCreated?: () => void) {
  const [artifact, setArtifact] = useState<ArtifactData | null>(null);
  const [isArtifactOpen, setIsArtifactOpen] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);

  // Configuration for the Vercel AI Hook
  const { messages, input, handleInputChange, handleSubmit, isLoading, stop, setMessages, append } = useVercelChat({
    api: "http://localhost:8788/chat", // Point to the brain worker /chat endpoint
    body: { sessionId, runId },
    initialMessages: agentStore.getMessages(runId),
    id: runId, // Ensure unique ID per run to force internal state reset

    onError: (error: Error) => {
      console.error("🧬 [Shadowbox] Chat Stream Broken", error);
    },
    
    onResponse: (response) => {
      if (!response.ok) {
        console.error("🧬 [Shadowbox] HTTP Error:", response.status, response.statusText);
      }
    },

    // Auto-update artifact data but don't force open the side-pane automatically
    onToolCall: ({ toolCall }) => {
      if (toolCall.toolName === 'create_code_artifact') {
        const args = toolCall.args as ArtifactData;
        
        if (args && args.path && args.content) {
          setArtifact(args);
          // Trigger file explorer refresh
          onFileCreated?.();
        }
      }
    },
  });

  // 1. Sync local messages to global store for tab switching
  useEffect(() => {
    if (messages.length > 0) {
      agentStore.setMessages(runId, messages);
    }
  }, [messages, runId]);

  // 2. Optimistic Sync: Hydrate from cache immediately, then sync from server in background
  useEffect(() => {
    async function sync() {
      // Guard: Don't sync from server if we are currently streaming a response
      if (isLoading) return;

      const cache = agentStore.getMessages(runId);
      console.log(`🧬 [Shadowbox] Checking cache for ${runId}:`, cache.length);
      
      // Optimistic UI: If we have cache, show it immediately
      if (cache.length > 0) {
        setMessages(cache);
        setIsHydrating(false);
      } else {
        // --- NEW: UI Reset ---
        // If no cache, ensure messages are empty for a fresh start
        setMessages([]);
        setIsHydrating(true);
      }

      console.log(`🧬 [Shadowbox] Syncing ${runId} from server...`);
      try {
        const res = await fetch(`http://localhost:8787/chat?session=${sessionId}&runId=${runId}`);
        if (!res.ok) throw new Error("History fetch failed");
        const history = await res.json();
        
        if (Array.isArray(history) && history.length > 0) {
          // Silent merge: only update if server has new info (simplistic length check)
          if (history.length !== cache.length) {
            console.log(`🧬 [Shadowbox] Server has updates (${history.length} vs ${cache.length}). Merging...`);
            setMessages(history);
            agentStore.setMessages(runId, history);
          } else {
            console.log(`🧬 [Shadowbox] Cache is up to date`);
          }
        } else if (cache.length > 0) {
          console.log(`🧬 [Shadowbox] Warning: Server history empty but cache has data`);
        }
      } catch (e) {
        console.error("🧬 [Shadowbox] Sync Failed:", e);
      } finally {
        setIsHydrating(false);
      }
    }
    sync();
  }, [sessionId, runId, setMessages]);

  // 3. Pending Query Consumption
  useEffect(() => {
    const pendingQuery = localStorage.getItem(`pending_query_${runId}`);
    if (pendingQuery && messages.length === 0 && !isLoading) {
      console.log(`🧬 [Shadowbox] Consuming pending query for ${runId}`);
      append({ role: 'user', content: pendingQuery });
      localStorage.removeItem(`pending_query_${runId}`);
    }
  }, [runId, messages.length, isLoading, append]);

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    append,
    isLoading,
    isHydrating,
    stop,
    artifactState: {
      artifact,
      setArtifact,
      isArtifactOpen,
      setIsArtifactOpen,
    },
  };
}