// apps/brain/src/core/engine/TaskExecutor.ts
// Phase 3B: Task execution implementation
// Phase 3D: Added AgentTaskExecutor for agent-based routing

import type { Task } from "../task";
import type { TaskRepository } from "../task";
import type { TaskResult, TaskOutput, IAgent } from "../../types";
import type { ITaskExecutor } from "../orchestration";

/**
 * Default task executor that handles different task types
 */
export class DefaultTaskExecutor implements ITaskExecutor {
  async execute(task: Task): Promise<TaskResult> {
    console.log(`[task/executor] Executing task ${task.id} (${task.type})`);

    const output: TaskOutput = {
      content: `Completed ${task.type} task: ${task.input.description}`,
    };

    return {
      taskId: task.id,
      status: "DONE",
      output,
      completedAt: new Date(),
    };
  }
}

/**
 * Agent-based task executor that delegates execution to an IAgent.
 * Phase 3D: Used when an agent is provided to RunEngine.
 * Resolves completed dependency results from TaskRepository.
 */
export class AgentTaskExecutor implements ITaskExecutor {
  constructor(
    private agent: IAgent,
    private runId: string,
    private taskRepo: TaskRepository,
  ) {}

  async execute(task: Task): Promise<TaskResult> {
    console.log(
      `[task/executor] Agent-based execution for task ${task.id} (${task.type})`,
    );

    const dependencies = await this.resolveDependencies(task);

    return this.agent.executeTask(task, {
      runId: this.runId,
      dependencies,
    });
  }

  private async resolveDependencies(task: Task): Promise<TaskResult[]> {
    if (task.dependencies.length === 0) {
      return [];
    }

    const depTasks = await this.taskRepo.getByIds(
      task.dependencies,
      this.runId,
    );

    return depTasks
      .filter((t) => t.status === "DONE")
      .map((t) => ({
        taskId: t.id,
        status: t.status,
        output: t.output,
        completedAt: t.updatedAt,
      }));
  }
}
