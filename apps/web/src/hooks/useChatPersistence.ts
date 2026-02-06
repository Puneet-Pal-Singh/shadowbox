import { useEffect } from "react";
import type { Message } from "@ai-sdk/react";
import { ChatPersistenceService } from "../services/ChatPersistenceService";

interface UseChatPersistenceProps {
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
  runId,
  messages,
  messagesLength,
  isLoading,
  append,
}: UseChatPersistenceProps): void {
  const persistenceService = new ChatPersistenceService();

  // Sync messages to global store
  useEffect(() => {
    persistenceService.syncToStore(runId, messages);
  }, [messages, runId]);

  // Restore pending query from localStorage
  useEffect(() => {
    const pendingQuery = persistenceService.getPendingQuery(runId);
    if (
      pendingQuery &&
      persistenceService.shouldRestorePendingQuery(messagesLength, isLoading)
    ) {
      append({ role: "user", content: pendingQuery });
      persistenceService.clearPendingQuery(runId);
    }
  }, [runId, messagesLength, isLoading, append]);
}
