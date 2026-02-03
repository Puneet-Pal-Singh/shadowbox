import { useEffect, useRef } from "react";
import type { Message } from "@ai-sdk/react";
import { ArtifactService } from "../services/ArtifactService";
import type { ArtifactState, ArtifactData } from "../types/chat";

interface UseChatArtifactsProps {
  messages: Message[];
  onFileCreated?: () => void;
}

/**
 * useChatArtifacts
 * Manages artifact state and tool call processing
 * Single Responsibility: Only manage artifact lifecycle
 */
export function useChatArtifacts({
  messages,
  onFileCreated,
}: UseChatArtifactsProps): ArtifactState {
  const artifactServiceRef = useRef(new ArtifactService(onFileCreated));

  // Process tool calls from messages
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant") return;

    if (lastMessage.toolInvocations && Array.isArray(lastMessage.toolInvocations)) {
      for (const invocation of lastMessage.toolInvocations) {
        if ("toolName" in invocation && "args" in invocation) {
          artifactServiceRef.current.processToolCall(
            invocation.toolName as string,
            invocation.args as Record<string, unknown>,
          );
        }
      }
    }
  }, [messages]);

  return {
    artifact: artifactServiceRef.current.getArtifact(),
    setArtifact: (artifact: ArtifactData | null) =>
      artifactServiceRef.current.setArtifact(artifact),
    isArtifactOpen: artifactServiceRef.current.isOpen(),
    setIsArtifactOpen: (isOpen: boolean) =>
      artifactServiceRef.current.setIsOpen(isOpen),
  };
}
