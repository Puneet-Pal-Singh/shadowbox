import { useChat as useVercelChat } from "@ai-sdk/react";
import { useState } from "react";

// Define the shape of our artifact
export interface ArtifactData {
  path: string;
  content: string;
}

export function useChat(sessionId: string, onFileCreated?: () => void) {
  const [artifact, setArtifact] = useState<ArtifactData | null>(null);
  const [isArtifactOpen, setIsArtifactOpen] = useState(false);

  // Configuration for the Vercel AI Hook
  const { messages, input, handleInputChange, handleSubmit, isLoading, stop } = useVercelChat({
    api: "http://localhost:8788/chat", // Point to the brain worker /chat endpoint
    body: { sessionId },

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

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    artifactState: {
      artifact,
      setArtifact,
      isArtifactOpen,
      setIsArtifactOpen,
    },
  };
}
