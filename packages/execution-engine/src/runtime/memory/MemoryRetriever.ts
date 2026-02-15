import {
  type MemoryEvent,
  type MemoryContext,
  type MemoryRetrievalOptions,
  type MemorySnapshot,
  MemoryScopeSchema,
  type MemoryPolicyConfig,
  MemoryEventSchema,
  MemorySnapshotSchema,
} from "./types.js";
import { MemoryRepository } from "./MemoryRepository.js";
import { MemoryPolicy } from "./MemoryPolicy.js";

export interface MemoryRetrieverDependencies {
  repository: MemoryRepository;
  policy?: MemoryPolicyConfig;
  sessionMemoryClient?: {
    getSessionMemoryContext(
      sessionId: string,
      prompt: string,
      limit?: number,
    ): Promise<{ events: unknown[]; snapshot?: unknown }>;
    getSessionSnapshot(sessionId: string): Promise<unknown | undefined>;
  };
}

interface ScoredEvent {
  event: MemoryEvent;
  score: number;
}

export class MemoryRetriever {
  private repository: MemoryRepository;
  private policy: MemoryPolicy;
  private sessionMemoryClient?: MemoryRetrieverDependencies["sessionMemoryClient"];

  constructor(deps: MemoryRetrieverDependencies) {
    this.repository = deps.repository;
    this.policy = new MemoryPolicy({ config: deps.policy });
    this.sessionMemoryClient = deps.sessionMemoryClient;
  }

  async retrieveContext(
    options: MemoryRetrievalOptions,
  ): Promise<MemoryContext> {
    const [runEvents, sessionResult] = await Promise.all([
      this.repository.getEvents(options.runId, MemoryScopeSchema.enum.run),
      this.getSessionMemory(options.sessionId, options.prompt),
    ]);

    const sessionEvents = sessionResult.events;
    const sessionSnapshot = sessionResult.snapshot;

    const maxTokens = options.maxTokens ?? this.policy.getMaxTokens();

    const scoredRunEvents = this.scoreEvents(runEvents, options);
    const scoredSessionEvents = this.scoreEvents(sessionEvents, options);

    const allScored = [...scoredRunEvents, ...scoredSessionEvents].sort(
      (a, b) => b.score - a.score,
    );

    const pinnedEvents = allScored
      .filter((se) => this.isPinned(se.event, options.includePinned))
      .map((se) => se.event);

    const remainingBudget = maxTokens - this.estimateTokens(pinnedEvents);

    let selectedEvents = [...pinnedEvents];
    let currentTokens = this.estimateTokens(pinnedEvents);

    for (const scored of allScored) {
      if (selectedEvents.some((e) => e.eventId === scored.event.eventId)) {
        continue;
      }

      const eventTokens = this.estimateEventTokens(scored.event);
      if (currentTokens + eventTokens > maxTokens) {
        break;
      }

      selectedEvents.push(scored.event);
      currentTokens += eventTokens;
    }

    selectedEvents.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const constraints = this.extractConstraints(selectedEvents);

    return {
      summary: sessionSnapshot?.summary,
      constraints,
      relevantEvents: selectedEvents,
      tokenEstimate: currentTokens,
    };
  }

  private async getSessionMemory(
    sessionId: string,
    prompt?: string,
  ): Promise<{ events: MemoryEvent[]; snapshot?: MemorySnapshot }> {
    if (this.sessionMemoryClient) {
      try {
        const result = await this.sessionMemoryClient.getSessionMemoryContext(
          sessionId,
          prompt || "",
          100,
        );
        // Validate events and snapshot using schemas for runtime type safety
        const validatedEvents: MemoryEvent[] = [];
        for (const event of result.events) {
          const parseResult = MemoryEventSchema.safeParse(event);
          if (parseResult.success) {
            validatedEvents.push(parseResult.data);
          }
        }

        let validatedSnapshot: MemorySnapshot | undefined;
        if (result.snapshot) {
          const snapshotResult = MemorySnapshotSchema.safeParse(
            result.snapshot,
          );
          if (snapshotResult.success) {
            validatedSnapshot = snapshotResult.data;
          }
        }

        return {
          events: validatedEvents,
          snapshot: validatedSnapshot,
        };
      } catch (error) {
        console.warn(
          "[memory/retriever] Failed to fetch session memory from client, falling back to repository:",
          error,
        );
      }
    }

    // Fallback to repository for session memory
    const [events, snapshot] = await Promise.all([
      this.repository.getEvents(sessionId, MemoryScopeSchema.enum.session),
      this.repository.getSnapshot(sessionId, MemoryScopeSchema.enum.session),
    ]);

    return { events, snapshot };
  }

  async getRunMemory(runId: string): Promise<{
    events: MemoryEvent[];
    snapshot?: MemorySnapshot;
  }> {
    const [events, snapshot] = await Promise.all([
      this.repository.getEvents(runId, MemoryScopeSchema.enum.run),
      this.repository.getSnapshot(runId, MemoryScopeSchema.enum.run),
    ]);

    return { events, snapshot };
  }

  async getSessionMemoryLegacy(sessionId: string): Promise<{
    events: MemoryEvent[];
    snapshot?: MemorySnapshot;
  }> {
    const [events, snapshot] = await Promise.all([
      this.repository.getEvents(sessionId, MemoryScopeSchema.enum.session),
      this.repository.getSnapshot(sessionId, MemoryScopeSchema.enum.session),
    ]);

    return { events, snapshot };
  }

  private scoreEvents(
    events: MemoryEvent[],
    options: MemoryRetrievalOptions,
  ): ScoredEvent[] {
    return events.map((event) => ({
      event,
      score: this.calculateScore(event, options),
    }));
  }

  private calculateScore(
    event: MemoryEvent,
    options: MemoryRetrievalOptions,
  ): number {
    let score = 0;

    const tagBoost = this.getTagBoost(event, options.phase);
    score += tagBoost * 10;

    const similarity = this.calculateSimilarity(event.content, options.prompt);
    score += similarity * 5;

    const recency = this.calculateRecencyScore(event.createdAt);
    score += recency * 3;

    score += event.confidence * 2;

    return score;
  }

  private getTagBoost(event: MemoryEvent, phase: string): number {
    const phaseTags: Record<string, string[]> = {
      planning: ["constraint", "decision", "fact"],
      execution: ["todo", "constraint"],
      synthesis: ["decision", "fact"],
    };

    const relevantTags = phaseTags[phase] ?? [];
    const matches = event.tags.filter((tag) => relevantTags.includes(tag));
    return matches.length / Math.max(relevantTags.length, 1);
  }

  private calculateSimilarity(content: string, prompt: string): number {
    const contentWords = new Set(content.toLowerCase().split(/\s+/));
    const promptWords = new Set(prompt.toLowerCase().split(/\s+/));

    if (contentWords.size === 0 || promptWords.size === 0) {
      return 0;
    }

    let matches = 0;
    for (const word of promptWords) {
      if (contentWords.has(word) && word.length > 3) {
        matches++;
      }
    }

    return matches / Math.sqrt(promptWords.size * contentWords.size);
  }

  private calculateRecencyScore(createdAt: string): number {
    const now = Date.now();
    const eventTime = new Date(createdAt).getTime();
    const hoursAgo = (now - eventTime) / (1000 * 60 * 60);

    if (hoursAgo < 1) return 1;
    if (hoursAgo < 24) return 0.8;
    if (hoursAgo < 168) return 0.6;
    if (hoursAgo < 720) return 0.4;
    return 0.2;
  }

  private isPinned(event: MemoryEvent, includePinned?: boolean): boolean {
    if (!includePinned) return false;
    return event.tags.includes("pinned") || event.tags.includes("important");
  }

  private estimateTokens(events: MemoryEvent[]): number {
    return events.reduce((sum, e) => sum + this.estimateEventTokens(e), 0);
  }

  private estimateEventTokens(event: MemoryEvent): number {
    const avgCharsPerToken = 4;
    return Math.ceil(event.content.length / avgCharsPerToken) + 10;
  }

  private extractConstraints(events: MemoryEvent[]): string[] {
    const constraintEvents = events.filter((e) => e.kind === "constraint");
    return [...new Set(constraintEvents.map((e) => e.content))].slice(0, 10);
  }

  formatContextForPrompt(context: MemoryContext): string {
    const lines: string[] = [];

    if (context.summary) {
      lines.push("## Session Context");
      lines.push(context.summary);
      lines.push("");
    }

    if (context.constraints.length > 0) {
      lines.push("## Constraints");
      for (const constraint of context.constraints) {
        lines.push(`- ${constraint}`);
      }
      lines.push("");
    }

    const decisions = context.relevantEvents.filter(
      (e) => e.kind === "decision",
    );
    if (decisions.length > 0) {
      lines.push("## Recent Decisions");
      for (const decision of decisions.slice(0, 5)) {
        lines.push(`- ${decision.content}`);
      }
      lines.push("");
    }

    const todos = context.relevantEvents.filter((e) => e.kind === "todo");
    if (todos.length > 0) {
      lines.push("## Outstanding Tasks");
      for (const todo of todos.slice(0, 5)) {
        lines.push(`- ${todo.content}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }
}
