import type { CoreMessage } from "ai";
import { pruneToolResults } from "@shadowbox/context-pruner";
import { Env } from "../types/ai";

export class PersistenceService {
  constructor(private env: Env) {}

  private generateIdempotencyKey(
    sessionId: string,
    runId: string,
    role: string,
    content: string,
  ): string {
    const data = `${sessionId}:${runId}:${role}:${content.slice(0, 50)}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  async persistUserMessage(
    sessionId: string,
    runId: string,
    message: CoreMessage,
  ): Promise<void> {
    try {
      const content =
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content);

      const idempotencyKey = this.generateIdempotencyKey(
        sessionId,
        runId,
        message.role,
        content,
      );

      await this.env.SECURE_API.fetch(
        `http://internal/chat?session=${sessionId}&runId=${runId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({ message, idempotencyKey }),
        },
      );
      console.log(`[Brain] Persisted ${message.role} message for run ${runId}`);
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
    console.log(
      `[Brain:${correlationId}] Persisting conversation. Total: ${messages.length} messages`,
    );
    const roles = messages.map((m) => m.role).join(" -> ");
    console.log(`[Brain:${correlationId}] Message Roles: ${roles}`);

    try {
      const prunedHistory = pruneToolResults(messages);
      console.log(
        `[Brain:${correlationId}] Pruned for context sync: ${prunedHistory.length} messages`,
      );

      if (prunedHistory.length > 0) {
        const idempotencyKey = this.generateIdempotencyKey(
          sessionId,
          runId,
          "batch",
          prunedHistory.map((m) => m.role).join(","),
        );

        await this.env.SECURE_API.fetch(
          `http://internal/chat?session=${sessionId}&runId=${runId}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify({ messages: prunedHistory, idempotencyKey }),
          },
        );
        console.log(`[Brain:${correlationId}] History Sync Successful`);
      }
    } catch (e) {
      console.error(`[Brain:${correlationId}] History Sync Failed:`, e);
    }
  }
}
