import type { CoreMessage } from "ai";
import { pruneToolResults } from "@shadowbox/context-pruner";
import { Env } from "../types/ai";

export class PersistenceService {
  constructor(private env: Env) {}

  async persistUserMessage(
    sessionId: string,
    runId: string,
    message: CoreMessage,
  ): Promise<void> {
    try {
      await this.env.SECURE_API.fetch(
        `http://internal/chat?session=${sessionId}&runId=${runId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        },
      );
    } catch (e) {
      console.error("[Brain] Persist user message failed", e);
    }
  }

  async persistConversation(
    sessionId: string,
    runId: string,
    messages: CoreMessage[],
    correlationId: string,
  ): Promise<void> {
    try {
      const prunedHistory = pruneToolResults(messages);

      if (prunedHistory.length > 0) {
        await this.env.SECURE_API.fetch(
          `http://internal/chat?session=${sessionId}&runId=${runId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: prunedHistory }),
          },
        );
      }
    } catch (e) {
      console.error(`[Brain:${correlationId}] History Sync Failed:`, e);
    }
  }
}
