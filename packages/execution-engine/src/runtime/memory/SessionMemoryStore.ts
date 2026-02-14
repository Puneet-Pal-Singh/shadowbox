import type { RuntimeDurableObjectState } from "../types.js";
import {
  MemoryEventSchema,
  type MemoryEvent,
  type MemorySnapshot,
  MemorySnapshotSchema,
} from "./types.js";

export interface SessionMemoryStoreDependencies {
  ctx: RuntimeDurableObjectState;
}

export class SessionMemoryStore {
  private ctx: RuntimeDurableObjectState;

  constructor(deps: SessionMemoryStoreDependencies) {
    this.ctx = deps.ctx;
  }

  private getSessionEventKey(sessionId: string, eventId: string): string {
    return `session:${sessionId}:memory:event:${eventId}`;
  }

  private getSessionSnapshotKey(sessionId: string): string {
    return `session:${sessionId}:memory:snapshot`;
  }

  private getIdempotencyKey(sessionId: string, idempotencyKey: string): string {
    return `session:${sessionId}:memory:idempotency:${idempotencyKey}`;
  }

  async appendSessionMemory(event: MemoryEvent): Promise<boolean> {
    if (event.scope !== "session") {
      throw new Error("SessionMemoryStore only accepts session-scoped events");
    }

    return this.ctx.blockConcurrencyWhile(async () => {
      const idempotencyKey = this.getIdempotencyKey(
        event.sessionId,
        event.idempotencyKey,
      );

      const existing = await this.ctx.storage.get<string>(idempotencyKey);
      if (existing) {
        return false;
      }

      const validated = MemoryEventSchema.parse(event);
      const eventKey = this.getSessionEventKey(event.sessionId, event.eventId);

      await this.ctx.storage.put(eventKey, validated);
      await this.ctx.storage.put(idempotencyKey, event.eventId);

      return true;
    });
  }

  async getSessionMemoryContext(
    sessionId: string,
    prompt: string,
    limit?: number,
  ): Promise<{
    events: MemoryEvent[];
    snapshot?: MemorySnapshot;
  }> {
    const [events, snapshot] = await Promise.all([
      this.getSessionEvents(sessionId, limit),
      this.getSessionSnapshot(sessionId),
    ]);

    const scored = events.map((event) => ({
      event,
      score: this.calculateRelevanceScore(event, prompt),
    }));

    const sorted = scored.sort((a, b) => b.score - a.score).map((s) => s.event);

    return { events: sorted, snapshot };
  }

  async getSessionEvents(
    sessionId: string,
    limit?: number,
  ): Promise<MemoryEvent[]> {
    const prefix = `session:${sessionId}:memory:event:`;
    const eventsMap = await this.ctx.storage.list<MemoryEvent>({
      prefix,
      limit,
    });

    return Array.from(eventsMap.values()).map((e) => MemoryEventSchema.parse(e));
  }

  async getSessionSnapshot(
    sessionId: string,
  ): Promise<MemorySnapshot | undefined> {
    const snapshotKey = this.getSessionSnapshotKey(sessionId);
    const snapshot = await this.ctx.storage.get<MemorySnapshot>(snapshotKey);
    return snapshot ? MemorySnapshotSchema.parse(snapshot) : undefined;
  }

  async upsertSessionSnapshot(snapshot: MemorySnapshot): Promise<void> {
    if (!snapshot.sessionId) {
      throw new Error("Session snapshot must have a sessionId");
    }

    const validated = MemorySnapshotSchema.parse(snapshot);
    const snapshotKey = this.getSessionSnapshotKey(snapshot.sessionId);
    await this.ctx.storage.put(snapshotKey, validated);
  }

  async clearSessionMemory(sessionId: string): Promise<void> {
    const keysToDelete: string[] = [this.getSessionSnapshotKey(sessionId)];

    const eventPrefix = `session:${sessionId}:memory:event:`;
    const eventKeys = await this.ctx.storage.list({ prefix: eventPrefix });
    keysToDelete.push(...Array.from(eventKeys.keys()));

    const idempotencyPrefix = `session:${sessionId}:memory:idempotency:`;
    const idempotencyKeys = await this.ctx.storage.list({
      prefix: idempotencyPrefix,
    });
    keysToDelete.push(...Array.from(idempotencyKeys.keys()));

    await this.ctx.storage.delete(keysToDelete);
  }

  async getSessionMemoryStats(sessionId: string): Promise<{
    eventCount: number;
    hasSnapshot: boolean;
  }> {
    const [events, snapshot] = await Promise.all([
      this.getSessionEvents(sessionId),
      this.getSessionSnapshot(sessionId),
    ]);

    return {
      eventCount: events.length,
      hasSnapshot: !!snapshot,
    };
  }

  private calculateRelevanceScore(event: MemoryEvent, prompt: string): number {
    let score = 0;

    const contentWords = new Set(event.content.toLowerCase().split(/\s+/));
    const promptWords = new Set(prompt.toLowerCase().split(/\s+/));

    if (contentWords.size === 0 || promptWords.size === 0) {
      return score;
    }

    let matches = 0;
    for (const word of promptWords) {
      if (contentWords.has(word) && word.length > 3) {
        matches++;
      }
    }

    score += (matches / Math.sqrt(promptWords.size * contentWords.size)) * 5;

    score += event.confidence * 2;

    const hoursAgo =
      (Date.now() - new Date(event.createdAt).getTime()) / (1000 * 60 * 60);
    if (hoursAgo < 1) score += 1;
    else if (hoursAgo < 24) score += 0.8;
    else if (hoursAgo < 168) score += 0.6;
    else if (hoursAgo < 720) score += 0.4;
    else score += 0.2;

    return score;
  }
}
