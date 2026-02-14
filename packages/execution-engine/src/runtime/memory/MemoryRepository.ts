import { z } from "zod";
import {
  MemoryEventSchema,
  type MemoryEvent,
  type MemorySnapshot,
  MemorySnapshotSchema,
  type ReplayCheckpoint,
  ReplayCheckpointSchema,
  type MemoryScope,
} from "./types.js";

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string | string[]): Promise<boolean | number>;
  list<T>(options?: { prefix?: string }): Promise<Map<string, T>>;
  transaction<T>(
    closure: (txn: DurableObjectStorage) => Promise<T>,
  ): Promise<T>;
}

export interface MemoryRepositoryDependencies {
  storage: DurableObjectStorage;
}

export class MemoryRepository {
  private storage: DurableObjectStorage;

  constructor(deps: MemoryRepositoryDependencies) {
    this.storage = deps.storage;
  }

  private getEventsKey(runId: string, scope: MemoryScope): string {
    return scope === "run"
      ? `run:${runId}:memory:events`
      : `session:${runId}:memory:events`;
  }

  private getSnapshotKey(runId: string, scope: MemoryScope): string {
    return scope === "run"
      ? `run:${runId}:memory:snapshot`
      : `session:${runId}:memory:snapshot`;
  }

  private getIdempotencyKey(
    runId: string,
    idempotencyKey: string,
    scope: MemoryScope,
  ): string {
    return scope === "run"
      ? `run:${runId}:memory:idempotency:${idempotencyKey}`
      : `session:${runId}:memory:idempotency:${idempotencyKey}`;
  }

  private getCheckpointKey(runId: string, sequence: number): string {
    return `run:${runId}:memory:checkpoint:${sequence}`;
  }

  async appendEvent(event: MemoryEvent): Promise<boolean> {
    return this.storage.transaction(async (txn) => {
      const idempotencyKey = this.getIdempotencyKey(
        event.scope === "run" ? event.runId : event.sessionId,
        event.idempotencyKey,
        event.scope,
      );

      const existing = await txn.get<string>(idempotencyKey);
      if (existing) {
        return false;
      }

      const validated = MemoryEventSchema.parse(event);
      const eventsKey = this.getEventsKey(
        event.scope === "run" ? event.runId : event.sessionId,
        event.scope,
      );

      const events = (await txn.get<MemoryEvent[]>(eventsKey)) ?? [];
      events.push(validated);

      await txn.put(eventsKey, events);
      await txn.put(idempotencyKey, event.eventId);

      return true;
    });
  }

  async getEvents(
    id: string,
    scope: MemoryScope,
    options?: { limit?: number; afterSequence?: number },
  ): Promise<MemoryEvent[]> {
    const eventsKey = this.getEventsKey(id, scope);
    const events = (await this.storage.get<MemoryEvent[]>(eventsKey)) ?? [];

    let filtered = events;
    if (options?.afterSequence !== undefined) {
      filtered = events.slice(options.afterSequence);
    }
    if (options?.limit !== undefined) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered.map((e) => MemoryEventSchema.parse(e));
  }

  async getSnapshot(
    id: string,
    scope: MemoryScope,
  ): Promise<MemorySnapshot | undefined> {
    const snapshotKey = this.getSnapshotKey(id, scope);
    const snapshot = await this.storage.get<MemorySnapshot>(snapshotKey);
    return snapshot ? MemorySnapshotSchema.parse(snapshot) : undefined;
  }

  async updateSnapshot(snapshot: MemorySnapshot): Promise<void> {
    const validated = MemorySnapshotSchema.parse(snapshot);
    const snapshotKey = this.getSnapshotKey(
      snapshot.runId ?? snapshot.sessionId,
      snapshot.runId ? "run" : "session",
    );
    await this.storage.put(snapshotKey, validated);
  }

  async createCheckpoint(checkpoint: ReplayCheckpoint): Promise<void> {
    const validated = ReplayCheckpointSchema.parse(checkpoint);
    const checkpointKey = this.getCheckpointKey(
      checkpoint.runId,
      checkpoint.sequence,
    );
    await this.storage.put(checkpointKey, validated);
  }

  async getCheckpoint(
    runId: string,
    sequence: number,
  ): Promise<ReplayCheckpoint | undefined> {
    const checkpointKey = this.getCheckpointKey(runId, sequence);
    const checkpoint = await this.storage.get<ReplayCheckpoint>(checkpointKey);
    return checkpoint ? ReplayCheckpointSchema.parse(checkpoint) : undefined;
  }

  async getLatestCheckpoint(
    runId: string,
  ): Promise<ReplayCheckpoint | undefined> {
    const prefix = `run:${runId}:memory:checkpoint:`;
    const checkpoints = await this.storage.list<ReplayCheckpoint>({ prefix });

    if (checkpoints.size === 0) {
      return undefined;
    }

    const sorted = Array.from(checkpoints.entries())
      .sort((a, b) => {
        const seqA = parseInt(a[0].split(":").pop() ?? "0", 10);
        const seqB = parseInt(b[0].split(":").pop() ?? "0", 10);
        return seqB - seqA;
      })
      .map(([, value]) => value);

    return sorted[0] ? ReplayCheckpointSchema.parse(sorted[0]) : undefined;
  }

  async getAllCheckpoints(runId: string): Promise<ReplayCheckpoint[]> {
    const prefix = `run:${runId}:memory:checkpoint:`;
    const checkpoints = await this.storage.list<ReplayCheckpoint>({ prefix });

    return Array.from(checkpoints.values())
      .sort((a, b) => a.sequence - b.sequence)
      .map((c) => ReplayCheckpointSchema.parse(c));
  }

  async clearRunMemory(runId: string): Promise<void> {
    const keysToDelete: string[] = [
      this.getEventsKey(runId, "run"),
      this.getSnapshotKey(runId, "run"),
    ];

    const prefix = `run:${runId}:memory:idempotency:`;
    const idempotencyKeys = await this.storage.list({ prefix });
    keysToDelete.push(...Array.from(idempotencyKeys.keys()));

    await this.storage.delete(keysToDelete);
  }
}
