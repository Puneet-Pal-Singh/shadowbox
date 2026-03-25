import type { RunEvent, RunWorkflowStep } from "@repo/shared-types";
import type { RunStatus, SerializedTask } from "../types.js";
import {
  createMessageEmittedEvent,
  createRunCompletedEvent,
  createRunFailedEvent,
  createRunStartedEvent,
  createRunStatusChangedEvent,
  createToolCompletedEvent,
  createToolFailedEvent,
  createToolRequestedEvent,
  createToolStartedEvent,
  mapRuntimeStatusToRunEventStatus,
  toToolEventInput,
} from "./RunEventFactory.js";
import { RunEventRepository } from "./RunEventRepository.js";

export class RunEventRecorder {
  constructor(
    private readonly repository: RunEventRepository,
    private readonly runId: string,
    private readonly sessionId: string,
    private readonly eventListener?: (event: RunEvent) => Promise<void> | void,
  ) {}

  async ensureRunStarted(status: RunStatus): Promise<void> {
    const existingEvents = await this.repository.getByRun(this.runId);
    if (existingEvents.length > 0) {
      return;
    }

    await this.append(
      createRunStartedEvent(
        this.baseInput(),
        status === "RUNNING" ? "running" : "queued",
      ),
    );
  }

  async recordRunStatusChanged(
    previousStatus: RunStatus,
    newStatus: RunStatus,
    workflowStep?: RunWorkflowStep,
    reason?: string,
  ): Promise<void> {
    if (previousStatus === newStatus && !workflowStep) {
      return;
    }

    await this.append(
      createRunStatusChangedEvent(
        this.baseInput(),
        mapRuntimeStatusToRunEventStatus(previousStatus),
        mapRuntimeStatusToRunEventStatus(newStatus),
        workflowStep,
        reason,
      ),
    );
  }

  async recordToolRequested(
    task: Pick<SerializedTask, "id" | "type"> & {
      input?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.append(
      createToolRequestedEvent(
        toToolEventInput(this.runId, this.sessionId, task),
        sanitizeEventArguments(task.input),
      ),
    );
  }

  async recordToolStarted(task: Pick<SerializedTask, "id" | "type">) {
    await this.append(
      createToolStartedEvent(
        toToolEventInput(this.runId, this.sessionId, task),
      ),
    );
  }

  async recordToolCompleted(
    task: Pick<SerializedTask, "id" | "type">,
    result: unknown,
    executionTimeMs: number,
  ): Promise<void> {
    await this.append(
      createToolCompletedEvent(
        toToolEventInput(this.runId, this.sessionId, task),
        result,
        executionTimeMs,
      ),
    );
  }

  async recordToolFailed(
    task: Pick<SerializedTask, "id" | "type">,
    error: string,
    executionTimeMs: number,
  ): Promise<void> {
    await this.append(
      createToolFailedEvent(
        toToolEventInput(this.runId, this.sessionId, task),
        error,
        executionTimeMs,
      ),
    );
  }

  async recordMessageEmitted(
    role: "user" | "assistant" | "system",
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!content.trim()) {
      return;
    }

    await this.append(
      createMessageEmittedEvent(this.baseInput(), content, role, metadata),
    );
  }

  async recordRunCompleted(
    totalDurationMs: number,
    toolsUsed: number,
  ): Promise<void> {
    await this.append(
      createRunCompletedEvent(this.baseInput(), totalDurationMs, toolsUsed),
    );
  }

  async recordRunFailed(error: string, totalDurationMs: number): Promise<void> {
    await this.append(
      createRunFailedEvent(this.baseInput(), error, totalDurationMs),
    );
  }

  async clear(): Promise<void> {
    await this.repository.clear(this.runId);
  }

  private baseInput() {
    return {
      runId: this.runId,
      sessionId: this.sessionId,
    };
  }

  private async append(event: RunEvent): Promise<void> {
    await this.repository.append(this.runId, event);
    if (!this.eventListener) {
      return;
    }

    try {
      await this.eventListener(event);
    } catch (error) {
      console.warn("[run/events] failed to emit live run event", error);
    }
  }
}

function sanitizeEventArguments(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!input) {
    return {};
  }

  const args: Record<string, unknown> = { ...input };
  delete args.description;
  delete args.expectedOutput;
  return args;
}
