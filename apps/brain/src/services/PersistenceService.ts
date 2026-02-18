import type { CoreMessage } from "ai";
import { pruneToolResults } from "@shadowbox/context-pruner";
import { Env } from "../types/ai";

export class PersistenceService {
  constructor(private env: Env) {}

  private async generateIdempotencyKey(
    sessionId: string,
    runId: string,
    role: string,
    content: string,
  ): Promise<string> {
    const data = `${sessionId}:${runId}:${role}:${content}`;
    const msgUint8 = new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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

      const idempotencyKey = await this.generateIdempotencyKey(
        sessionId,
        runId,
        message.role,
        content,
      );

      await this.env.SECURE_API.fetch(
        `http://internal/api/chat/history/${runId}?session=${sessionId}`,
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
        const idempotencyKey = await this.generateIdempotencyKey(
          sessionId,
          runId,
          "batch",
          prunedHistory.map((m) => m.role).join(","),
        );

        await this.env.SECURE_API.fetch(
          `http://internal/api/chat/history/${runId}?session=${sessionId}`,
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
