import { useChat as useVercelChat } from "@ai-sdk/react";
import { useState, useEffect } from "react";
import { agentStore } from "../store/agentStore";

// Define the shape of our artifact
export interface ArtifactData {
  path: string;
  content: string;
}

export function useChat(sessionId: string, agentId: string = "default", onFileCreated?: () => void) {
  const [artifact, setArtifact] = useState<ArtifactData | null>(null);
  const [isArtifactOpen, setIsArtifactOpen] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);

  // Configuration for the Vercel AI Hook
  const { messages, input, handleInputChange, handleSubmit, isLoading, stop, setMessages } = useVercelChat({
    api: "http://localhost:8788/chat", // Point to the brain worker /chat endpoint
    body: { sessionId, agentId },
    initialMessages: agentStore.getMessages(agentId),

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
      agentStore.setMessages(agentId, messages);
    }
  }, [messages, agentId]);

  // 2. Optimistic Sync: Hydrate from cache immediately, then sync from server in background
  useEffect(() => {
    async function sync() {
      const cache = agentStore.getMessages(agentId);
      console.log(`🧬 [Shadowbox] Checking cache for ${agentId}:`, cache.length);
      
      // Optimistic UI: If we have cache, show it immediately
      if (cache.length > 0) {
        setMessages(cache);
        setIsHydrating(false);
      } else {
        setIsHydrating(true);
      }

      console.log(`🧬 [Shadowbox] Syncing ${agentId} from server...`);
      try {
        const res = await fetch(`http://localhost:8787/history?session=${sessionId}&agentId=${agentId}`);
        if (!res.ok) throw new Error("History fetch failed");
        const data = await res.json();
        
        if (data.history && data.history.length > 0) {
          // Silent merge: only update if server has new info (simplistic length check)
          if (data.history.length !== cache.length) {
            console.log(`🧬 [Shadowbox] Server has updates (${data.history.length} vs ${cache.length}). Merging...`);
            setMessages(data.history);
            agentStore.setMessages(agentId, data.history);
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
  }, [sessionId, agentId, setMessages]);

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
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
