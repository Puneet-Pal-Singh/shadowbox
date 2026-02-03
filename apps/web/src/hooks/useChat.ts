import { useRef, useEffect, type FormEvent } from "react";
import type { Message } from "@ai-sdk/react";
import { useChatCore } from "./useChatCore";
import { useChatHydration } from "./useChatHydration";
import { useChatPersistence } from "./useChatPersistence";
import { useChatArtifacts } from "./useChatArtifacts";
import type { ArtifactState } from "../types/chat";

interface UseChatResult {
  messages: Message[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e?: FormEvent) => void;
  append: (message: { role: "user"; content: string }) => void;
  isLoading: boolean;
  isHydrating: boolean;
  stop: () => void;
  artifactState: ArtifactState;
}

/**
 * useChat
 * Main hook that composes all chat-related functionality
 * Orchestrates: Core chat, hydration, persistence, and artifacts
 */
export function useChat(
  sessionId: string,
  runId: string = "default",
  onFileCreated?: () => void,
): UseChatResult {
  // Stable instance key per runId
  const instanceKeyRef = useRef(`${runId}`);
  const hasHydratedRef = useRef(false);

  // Reset hydration flag when runId changes
  useEffect(() => {
    instanceKeyRef.current = `${runId}`;
    hasHydratedRef.current = false;
  }, [runId]);

  // Core chat functionality
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    append,
    isLoading,
    stop,
    setMessages,
  } = useChatCore(sessionId, runId, instanceKeyRef.current);

  // Handle message hydration
  const { isHydrating } = useChatHydration(
    sessionId,
    runId,
    messages.length,
    setMessages,
  );

  // Handle message persistence
  useChatPersistence({
    runId,
    messages,
    messagesLength: messages.length,
    isLoading,
    append,
  });

  // Handle artifact state
  const artifactState = useChatArtifacts({
    messages,
    onFileCreated,
  });

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    append,
    isLoading,
    isHydrating,
    stop,
    artifactState,
  };
}
