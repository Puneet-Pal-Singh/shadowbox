import { useChat as useVercelChat } from "@ai-sdk/react";
import { useState, useEffect } from "react";

// Define the shape of our artifact
export interface ArtifactData {
  path: string;
  content: string;
}

export function useChat(sessionId: string, agentId: string = "default", onFileCreated?: () => void) {
  const [artifact, setArtifact] = useState<ArtifactData | null>(null);
  const [isArtifactOpen, setIsArtifactOpen] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);

  // Configuration for the Vercel AI Hook
  const { messages, input, handleInputChange, handleSubmit, isLoading, stop, setMessages } = useVercelChat({
    api: "http://localhost:8788/chat", // Point to the brain worker /chat endpoint
    body: { sessionId, agentId },

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

  // Hydration logic: Fetch history when session or agent changes
  useEffect(() => {
    async function hydrate() {
      setIsHydrating(true);
      try {
        const res = await fetch(`http://localhost:8787/history?session=${sessionId}&agentId=${agentId}`);
        if (!res.ok) throw new Error("History fetch failed");
        const data = await res.json();
        if (data.history) {
          setMessages(data.history);
        } else {
          setMessages([]);
        }
      } catch (e) {
        console.error("🧬 [Shadowbox] Hydration Failed:", e);
        setMessages([]);
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
