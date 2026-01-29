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
    api: "http://localhost:8788/api/chat", // Use localhost and /api/chat
    body: { sessionId },

    // Combined Logic: Single occurrence of onError
    onError: (error: Error) => {
      console.error("🧬 [Shadowbox] Chat Stream Broken");
      console.error("Error Message:", error.message);
      console.error("Error Stack:", error.stack);
      console.error("Error Object:", error);
      // For deep debugging in console
      console.dir(error); 
    },
    // Enable error logging from the stream
    onResponse: (response) => {
      if (!response.ok) {
        console.error("🧬 [Shadowbox] HTTP Error:", response.status, response.statusText);
      }
    },

    // Auto-open artifact panel when the AI creates code
    onToolCall: ({ toolCall }) => {
      if (toolCall.toolName === 'create_code_artifact') {
        // Cast args safely using the interface
        const args = toolCall.args as ArtifactData;
        
        // Logic: Only trigger if the AI has actually provided content/path
        if (args && args.path && args.content) {
          setArtifact(args);
          setIsArtifactOpen(true);
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
    // Return artifact state so Workspace.tsx can render the Side Pane
    artifactState: {
      artifact,
      isArtifactOpen,
      setIsArtifactOpen,
    },
  };
}