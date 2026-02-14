import {
  type MemoryEvent,
  type MemorySnapshot,
  MemoryKindSchema,
  type MemoryExtractionInput,
  MemorySourceSchema,
} from "./types.js";
import { z } from "zod";
import { randomUUID } from "crypto";

export interface MemoryExtractorDependencies {
  generateId: () => string;
  getTimestamp: () => string;
}

export class MemoryExtractor {
  private generateId: () => string;
  private getTimestamp: () => string;

  constructor(
    deps: MemoryExtractorDependencies = {
      generateId: () => randomUUID(),
      getTimestamp: () => new Date().toISOString(),
    },
  ) {
    this.generateId = deps.generateId;
    this.getTimestamp = deps.getTimestamp;
  }

  extract(input: MemoryExtractionInput): MemoryEvent[] {
    const events: MemoryEvent[] = [];
    const timestamp = this.getTimestamp();
    const idempotencyBase = `${input.runId}:${input.taskId ?? "run"}:${input.phase}`;

    const parsedConstraints = this.parseConstraints(input.content);
    for (const constraint of parsedConstraints) {
      events.push({
        eventId: this.generateId(),
        idempotencyKey: `${idempotencyBase}:constraint:${events.length}`,
        runId: input.runId,
        sessionId: input.sessionId,
        taskId: input.taskId,
        scope: input.taskId ? "run" : "session",
        kind: "constraint",
        content: constraint,
        tags: ["extracted", "constraint"],
        confidence: 0.9,
        source: input.source,
        createdAt: timestamp,
      });
    }

    const parsedDecisions = this.parseDecisions(input.content);
    for (const decision of parsedDecisions) {
      events.push({
        eventId: this.generateId(),
        idempotencyKey: `${idempotencyBase}:decision:${events.length}`,
        runId: input.runId,
        sessionId: input.sessionId,
        taskId: input.taskId,
        scope: input.taskId ? "run" : "session",
        kind: "decision",
        content: decision,
        tags: ["extracted", "decision"],
        confidence: 0.85,
        source: input.source,
        createdAt: timestamp,
      });
    }

    const parsedTodos = this.parseTodos(input.content);
    for (const todo of parsedTodos) {
      events.push({
        eventId: this.generateId(),
        idempotencyKey: `${idempotencyBase}:todo:${events.length}`,
        runId: input.runId,
        sessionId: input.sessionId,
        taskId: input.taskId,
        scope: "run",
        kind: "todo",
        content: todo,
        tags: ["extracted", "todo"],
        confidence: 0.8,
        source: input.source,
        createdAt: timestamp,
      });
    }

    const parsedFacts = this.parseFacts(input.content);
    for (const fact of parsedFacts) {
      events.push({
        eventId: this.generateId(),
        idempotencyKey: `${idempotencyBase}:fact:${events.length}`,
        runId: input.runId,
        sessionId: input.sessionId,
        taskId: input.taskId,
        scope: "session",
        kind: "fact",
        content: fact,
        tags: ["extracted", "fact"],
        confidence: 0.75,
        source: input.source,
        createdAt: timestamp,
      });
    }

    return events.filter((e) => this.validateEvent(e));
  }

  private parseConstraints(content: string): string[] {
    const constraints: string[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (this.isConstraintIndicator(trimmed)) {
        const constraint = this.extractContentAfterIndicator(trimmed);
        if (constraint && constraint.length > 10) {
          constraints.push(constraint);
        }
      }
    }

    const constraintSection = this.extractSection(content, "constraint");
    if (constraintSection) {
      const sectionConstraints = constraintSection
        .split("\n")
        .map((l) => l.trim())
        .filter(
          (l) => l.length > 10 && !l.toLowerCase().startsWith("constraint"),
        );
      constraints.push(...sectionConstraints);
    }

    return [...new Set(constraints)].slice(0, 5);
  }

  private parseDecisions(content: string): string[] {
    const decisions: string[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (this.isDecisionIndicator(trimmed)) {
        const decision = this.extractContentAfterIndicator(trimmed);
        if (decision && decision.length > 10) {
          decisions.push(decision);
        }
      }
    }

    const decisionSection = this.extractSection(content, "decision");
    if (decisionSection) {
      const sectionDecisions = decisionSection
        .split("\n")
        .map((l) => l.trim())
        .filter(
          (l) => l.length > 10 && !l.toLowerCase().startsWith("decision"),
        );
      decisions.push(...sectionDecisions);
    }

    return [...new Set(decisions)].slice(0, 5);
  }

  private parseTodos(content: string): string[] {
    const todos: string[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (this.isTodoIndicator(trimmed)) {
        const todo = this.extractContentAfterIndicator(trimmed);
        if (todo && todo.length > 5) {
          todos.push(todo);
        }
      }
    }

    const todoSection = this.extractSection(content, "todo");
    if (todoSection) {
      const sectionTodos = todoSection
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 5 && !l.toLowerCase().startsWith("todo"));
      todos.push(...sectionTodos);
    }

    return [...new Set(todos)].slice(0, 10);
  }

  private parseFacts(content: string): string[] {
    const facts: string[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (this.isFactIndicator(trimmed)) {
        const fact = this.extractContentAfterIndicator(trimmed);
        if (fact && fact.length > 15) {
          facts.push(fact);
        }
      }
    }

    const factSection = this.extractSection(content, "fact");
    if (factSection) {
      const sectionFacts = factSection
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 15 && !l.toLowerCase().startsWith("fact"));
      facts.push(...sectionFacts);
    }

    return [...new Set(facts)].slice(0, 5);
  }

  private isConstraintIndicator(line: string): boolean {
    const indicators = [
      "constraint:",
      "must:",
      "should:",
      "requirement:",
      "important:",
    ];
    return indicators.some((ind) => line.toLowerCase().startsWith(ind));
  }

  private isDecisionIndicator(line: string): boolean {
    const indicators = [
      "decision:",
      "decided:",
      "will:",
      "choose:",
      "selected:",
      "using:",
    ];
    return indicators.some((ind) => line.toLowerCase().startsWith(ind));
  }

  private isTodoIndicator(line: string): boolean {
    const indicators = ["todo:", "task:", "action:", "next:", "then:", "step:"];
    return indicators.some((ind) => line.toLowerCase().startsWith(ind));
  }

  private isFactIndicator(line: string): boolean {
    const indicators = [
      "fact:",
      "note:",
      "remember:",
      "context:",
      "the user:",
      "the project:",
    ];
    return indicators.some((ind) => line.toLowerCase().startsWith(ind));
  }

  private extractContentAfterIndicator(line: string): string | null {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0 && colonIndex < line.length - 1) {
      return line.slice(colonIndex + 1).trim();
    }
    return null;
  }

  private extractSection(content: string, sectionName: string): string | null {
    const regex = new RegExp(
      `(?:^|\n)\\s*${sectionName}s?:?\\s*\n(.*?)(?:\n\s*(?:constraint|decision|todo|fact|note)s?:?\s*\n|$)`,
      "i",
    );
    const match = content.match(regex);
    return match?.[1]?.trim() ?? null;
  }

  private validateEvent(event: MemoryEvent): boolean {
    try {
      MemoryKindSchema.parse(event.kind);
      MemorySourceSchema.parse(event.source);
      return (
        event.content.length > 0 &&
        event.confidence >= 0 &&
        event.confidence <= 1
      );
    } catch {
      return false;
    }
  }

  buildSnapshot(
    events: MemoryEvent[],
    sessionId: string,
    runId?: string,
  ): MemorySnapshot {
    const constraints = events
      .filter((e) => e.kind === "constraint")
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10)
      .map((e) => e.content);

    const decisions = events
      .filter((e) => e.kind === "decision")
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10)
      .map((e) => e.content);

    const todos = events
      .filter((e) => e.kind === "todo")
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 10)
      .map((e) => e.content);

    const summary = this.generateSummary(events);

    return {
      runId,
      sessionId,
      summary,
      constraints,
      decisions,
      todos,
      updatedAt: this.getTimestamp(),
      version: 1,
    };
  }

  private generateSummary(events: MemoryEvent[]): string {
    if (events.length === 0) {
      return "No memory events recorded.";
    }

    const kinds = events.reduce(
      (acc, e) => {
        acc[e.kind] = (acc[e.kind] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const parts: string[] = [];
    for (const [kind, count] of Object.entries(kinds)) {
      parts.push(`${count} ${kind}(s)`);
    }

    return `Session contains ${parts.join(", ")}.`;
  }
}
