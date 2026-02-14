import {
  type MemoryEvent,
  type MemoryContext,
  type MemoryRetrievalOptions,
  type MemorySnapshot,
  type MemoryExtractionInput,
  type ReplayCheckpoint,
} from "./types.js";
import { MemoryRepository } from "./MemoryRepository.js";
import { MemoryExtractor } from "./MemoryExtractor.js";
import { MemoryRetriever } from "./MemoryRetriever.js";
import { MemoryPolicy, type MemoryPolicyDependencies } from "./MemoryPolicy.js";
import { randomUUID } from "crypto";

export interface MemoryCoordinatorDependencies {
  repository: MemoryRepository;
  extractor?: MemoryExtractor;
  retriever?: MemoryRetriever;
  policy?: MemoryPolicyDependencies;
}

export class MemoryCoordinator {
  private repository: MemoryRepository;
  private extractor: MemoryExtractor;
  private retriever: MemoryRetriever;
  private policy: MemoryPolicy;

  constructor(deps: MemoryCoordinatorDependencies) {
    this.repository = deps.repository;
    this.extractor = deps.extractor ?? new MemoryExtractor();
    this.retriever =
      deps.retriever ??
      new MemoryRetriever({
        repository: deps.repository,
      });
    this.policy = new MemoryPolicy(deps.policy);
  }

  async retrieveContext(
    options: MemoryRetrievalOptions,
  ): Promise<MemoryContext> {
    return this.retriever.retrieveContext(options);
  }

  async extractAndPersist(
    input: MemoryExtractionInput,
  ): Promise<MemoryEvent[]> {
    const events = this.extractor.extract(input);
    const validEvents: MemoryEvent[] = [];

    for (const event of events) {
      const validation = this.policy.validateMemoryContent(event.content);
      if (!validation.valid) {
        continue;
      }

      const redactedContent = this.policy.redactSensitiveContent(event.content);
      if (redactedContent !== event.content) {
        event.content = redactedContent;
      }

      const appended = await this.repository.appendEvent(event);
      if (appended) {
        validEvents.push(event);
      }
    }

    return validEvents;
  }

  async createCheckpoint(params: {
    runId: string;
    sequence: number;
    phase: "planning" | "execution" | "synthesis";
    runStatus: string;
    taskStatuses: Record<string, string>;
  }): Promise<ReplayCheckpoint> {
    const latestSnapshot = await this.repository.getLatestCheckpoint(
      params.runId,
    );
    const memoryEvents = await this.repository.getEvents(params.runId, "run");

    const checkpoint: ReplayCheckpoint = {
      checkpointId: randomUUID(),
      runId: params.runId,
      sequence: params.sequence,
      phase: params.phase,
      runStatus: params.runStatus,
      taskStatuses: params.taskStatuses,
      memorySnapshotVersion: latestSnapshot ? 1 : 0,
      memoryEventWatermark: memoryEvents.length,
      transcriptSequenceWatermark: params.sequence,
      hash: this.computeCheckpointHash(params),
      createdAt: new Date().toISOString(),
    };

    await this.repository.createCheckpoint(checkpoint);
    return checkpoint;
  }

  async getCheckpointForResume(
    runId: string,
  ): Promise<ReplayCheckpoint | undefined> {
    return this.repository.getLatestCheckpoint(runId);
  }

  async compactMemory(runId: string, sessionId: string): Promise<void> {
    const [runEvents, sessionEvents] = await Promise.all([
      this.repository.getEvents(runId, "run"),
      this.repository.getEvents(sessionId, "session"),
    ]);

    if (this.policy.shouldCompact(runEvents.length, "run")) {
      await this.compactRunMemory(runId, runEvents);
    }

    if (this.policy.shouldCompact(sessionEvents.length, "session")) {
      await this.compactSessionMemory(sessionId, sessionEvents);
    }
  }

  private async compactRunMemory(
    runId: string,
    events: MemoryEvent[],
  ): Promise<void> {
    const snapshot = this.extractor.buildSnapshot(events, "", runId);
    await this.repository.updateSnapshot({
      ...snapshot,
      runId,
      sessionId: "",
    });
  }

  private async compactSessionMemory(
    sessionId: string,
    events: MemoryEvent[],
  ): Promise<void> {
    const snapshot = this.extractor.buildSnapshot(events, sessionId);
    await this.repository.updateSnapshot({
      ...snapshot,
      sessionId,
    });
  }

  async getMemoryStats(
    runId: string,
    sessionId: string,
  ): Promise<{
    runEventCount: number;
    sessionEventCount: number;
    totalTokens: number;
  }> {
    const [runEvents, sessionEvents] = await Promise.all([
      this.repository.getEvents(runId, "run"),
      this.repository.getEvents(sessionId, "session"),
    ]);

    const allEvents = [...runEvents, ...sessionEvents];
    const totalTokens = allEvents.reduce(
      (sum, e) => sum + this.policy.estimateTokens(e.content),
      0,
    );

    return {
      runEventCount: runEvents.length,
      sessionEventCount: sessionEvents.length,
      totalTokens,
    };
  }

  async clearRunMemory(runId: string): Promise<void> {
    await this.repository.clearRunMemory(runId);
  }

  formatContextForPrompt(context: MemoryContext): string {
    return this.retriever.formatContextForPrompt(context);
  }

  private computeCheckpointHash(params: {
    runId: string;
    sequence: number;
    phase: string;
    runStatus: string;
    taskStatuses: Record<string, string>;
  }): string {
    const data = JSON.stringify({
      runId: params.runId,
      sequence: params.sequence,
      phase: params.phase,
      runStatus: params.runStatus,
      taskStatuses: Object.entries(params.taskStatuses).sort(),
    });

    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return hash.toString(16);
  }
}
