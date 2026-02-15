import type { Message } from "@ai-sdk/react";
import { agentStore } from "../store/agentStore";

/**
 * ChatPersistenceService
 * Manages chat message persistence and retrieval
 * Single Responsibility: Persist messages to store and localStorage
 */
export class ChatPersistenceService {
  /**
   * Sync messages to global store
   * Enables cross-tab message access
   */
  syncToStore(runId: string, messages: Message[]): void {
    if (messages.length > 0) {
      agentStore.setMessages(runId, messages);
    }
  }

  /**
   * Get pending query from localStorage
   */
  getPendingQuery(sessionId: string): string | null {
    return localStorage.getItem(`pending_query_${sessionId}`);
  }

  /**
   * Clear pending query from localStorage
   */
  clearPendingQuery(sessionId: string): void {
    localStorage.removeItem(`pending_query_${sessionId}`);
  }

  /**
   * Check if should restore pending query
   */
  shouldRestorePendingQuery(
    messagesCount: number,
    isLoading: boolean,
  ): boolean {
    return messagesCount === 0 && !isLoading;
  }
}
