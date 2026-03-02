/**
 * CloudflareExecutionAdapter - Cloudflare implementation of ExecutionRuntimePort.
 *
 * Bridges Cloudflare Durable Objects and Workers to execution port contracts.
 * This adapter owns the lifecycle of runs and task scheduling on Cloudflare infra.
 */

import type { DurableObjectState as LegacyDurableObjectState } from "@cloudflare/workers-types";
import type { ExecuteTaskInput, TaskResult } from "@shadowbox/execution-engine/runtime";
import { RunRepository } from "@shadowbox/execution-engine/runtime/run";
import { TaskRepository } from "@shadowbox/execution-engine/runtime/task";
import { tagRuntimeStateSemantics } from "@shadowbox/execution-engine/runtime";
import type { ExecutionRuntimePort } from "../ports";

/**
 * Cloudflare-backed implementation of execution and orchestration.
 *
 * Owns:
 * - Run state transitions via Durable Objects
 * - Task scheduling and sequencing
 * - Task result persistence
 */
export class CloudflareExecutionAdapter implements ExecutionRuntimePort {
  private readonly ctx: unknown;
  private readonly runRepo: RunRepository;
  private readonly taskRepo: TaskRepository;

  constructor(ctx: unknown) {
    this.ctx = ctx;
    const runtimeState = tagRuntimeStateSemantics(
      ctx as unknown as LegacyDurableObjectState,
      "do",
    );
    this.runRepo = new RunRepository(runtimeState);
    this.taskRepo = new TaskRepository(runtimeState);
  }

  async executeTask(_runId: string, _input: ExecuteTaskInput): Promise<TaskResult> {
    // This method will be called by the Secure Agent API (Muscle).
    // The adapter here merely ensures type conformance.
    // Actual execution is handled by secure-agent-api's ExecutionSandboxPort implementation.
    throw new Error(
      "ExecutionSandboxPort.executeTask should be invoked at Muscle boundary, not Brain.",
    );
  }

  async cancelTask(runId: string, taskId: string): Promise<boolean> {
    const task = await this.taskRepo.getById(taskId);
    if (!task || task.runId !== runId) {
      return false;
    }

    if (["PENDING", "READY", "RUNNING"].includes(task.status)) {
      task.transition("CANCELLED");
      await this.taskRepo.update(task);
      return true;
    }

    return false;
  }

  async getRunState(
    runId: string,
  ): Promise<{
    runId: string;
    status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
    createdAt: number;
    updatedAt: number;
  } | null> {
    const run = await this.runRepo.getById(runId);
    if (!run) {
      return null;
    }

    return {
      runId: run.id,
      status: run.status as "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED",
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }

  async transitionRun(
    runId: string,
    newStatus: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED",
  ): Promise<void> {
    const run = await this.runRepo.getById(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    run.transition(newStatus);
    await this.runRepo.update(run);
  }

  async scheduleNext(
    runId: string,
  ): Promise<{ taskId: string; input: ExecuteTaskInput } | null> {
    const tasks = await this.taskRepo.getByRun(runId);
    const nextTask = tasks.find((t) => t.status === "PENDING");

    if (!nextTask) {
      return null;
    }

    return {
      taskId: nextTask.id,
      input: {
        action: nextTask.action,
        params: nextTask.params,
      } as ExecuteTaskInput,
    };
  }
}
