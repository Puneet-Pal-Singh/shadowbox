import { useEffect, useMemo } from "react";
import type { Message } from "@ai-sdk/react";
import { ChatPersistenceService } from "../services/ChatPersistenceService";

interface UseChatPersistenceProps {
  sessionId: string;
  runId: string;
  messages: Message[];
  messagesLength: number;
  isLoading: boolean;
  append: (message: { role: "user"; content: string }) => void;
}

/**
 * useChatPersistence
 * Manages message persistence and pending query restoration
 * Single Responsibility: Only manage persistence lifecycle
 */
export function useChatPersistence({
  sessionId,
  runId,
  messages,
  messagesLength,
  isLoading,
  append,
}: UseChatPersistenceProps): void {
  const persistenceService = useMemo(() => new ChatPersistenceService(), []);

  // Sync messages to global store
  useEffect(() => {
    persistenceService.syncToStore(runId, messages);
  }, [messages, runId, persistenceService]);

  // Restore pending query from localStorage
  useEffect(() => {
    const pendingQuery = persistenceService.getPendingQuery(sessionId);
    if (
      pendingQuery &&
      persistenceService.shouldRestorePendingQuery(messagesLength, isLoading)
    ) {
      append({ role: "user", content: pendingQuery });
      persistenceService.clearPendingQuery(sessionId);
    }
  }, [
    sessionId,
    messagesLength,
    isLoading,
    append,
    persistenceService,
  ]);
}
