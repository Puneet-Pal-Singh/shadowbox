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

  // 2. Hydration logic: Fetch history from DO if local store is empty
  useEffect(() => {
    async function hydrate() {
      const existingMessages = agentStore.getMessages(agentId);
      console.log(`🧬 [Shadowbox] Checking cache for ${agentId}:`, existingMessages.length);
      
      if (existingMessages.length > 0) {
        setIsHydrating(false);
        return;
      }

      setIsHydrating(true);
      console.log(`🧬 [Shadowbox] Hydrating ${agentId} from server...`);
      try {
        const res = await fetch(`http://localhost:8787/history?session=${sessionId}&agentId=${agentId}`);
        if (!res.ok) throw new Error("History fetch failed");
        const data = await res.json();
        if (data.history && data.history.length > 0) {
          console.log(`🧬 [Shadowbox] Hydrated ${data.history.length} messages`);
          setMessages(data.history);
          agentStore.setMessages(agentId, data.history);
        } else {
          console.log(`🧬 [Shadowbox] No server history for ${agentId}`);
        }
      } catch (e) {
        console.error("🧬 [Shadowbox] Hydration Failed:", e);
      } finally {
        setIsHydrating(false);
      }
    }
    hydrate();
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
