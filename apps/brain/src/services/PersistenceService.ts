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
    console.log(`[Brain:${correlationId}] Persisting conversation. Total: ${messages.length} messages`);
    // Audit the sequence of roles to ensure nothing is lost
    const roles = messages.map(m => m.role).join(' -> ');
    console.log(`[Brain:${correlationId}] Message Roles: ${roles}`);

    try {
      const prunedHistory = pruneToolResults(messages);
      console.log(`[Brain:${correlationId}] Pruned for context sync: ${prunedHistory.length} messages`);

      if (prunedHistory.length > 0) {
        await this.env.SECURE_API.fetch(
          `http://internal/chat?session=${sessionId}&runId=${runId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: prunedHistory }),
          },
        );
        console.log(`[Brain:${correlationId}] History Sync Successful`);
      }
    } catch (e) {
      console.error(`[Brain:${correlationId}] History Sync Failed:`, e);
    }
  }
}
