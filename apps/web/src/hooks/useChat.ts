// apps/web/src/hooks/useChat.ts
import { useChat as useVercelChat } from "@ai-sdk/react";
import { useState } from "react";

// Define the shape of our artifact
export interface ArtifactData {
  path: string;
  content: string;
}

export function useChat(sessionId: string) {
  const [artifact, setArtifact] = useState<ArtifactData | null>(null);
  const [isArtifactOpen, setIsArtifactOpen] = useState(false);

  // Configuration for the Vercel AI Hook
  const { messages, input, handleInputChange, handleSubmit, isLoading, stop } = useVercelChat({
    api: "http://localhost:8788/chat", // Point to Brain port (8788)
    body: { sessionId },

    // Auto-open artifact panel when the AI creates code
    onToolCall: ({ toolCall }) => {
      if (toolCall.toolName === "create_code_artifact") {
        const args = toolCall.args as ArtifactData;
        setArtifact(args);
        setIsArtifactOpen(true);
      }
    },

    onError: (error: Error) => {
      console.error("Chat Error:", error);
    },
  });

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    // Return artifact state so Workspace.tsx can render the Side Pane
    artifactState: {
      artifact,
      isArtifactOpen,
      setIsArtifactOpen,
    },
  };
}