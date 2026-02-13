// apps/brain/src/core/engine/TaskExecutor.ts
// Phase 3B: Task execution implementation
// Phase 3D: Added AgentTaskExecutor for agent-based routing

import type { Task } from "../task";
import type { TaskResult, TaskOutput, IAgent } from "../../types";
import type { ITaskExecutor } from "../orchestration";

/**
 * Default task executor that handles different task types
 */
export class DefaultTaskExecutor implements ITaskExecutor {
  async execute(task: Task): Promise<TaskResult> {
    console.log(`[task/executor] Executing task ${task.id} (${task.type})`);

    // TODO: Phase 3C - Implement actual task execution logic per type
    // For now, simulate task execution
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
 */
export class AgentTaskExecutor implements ITaskExecutor {
  constructor(
    private agent: IAgent,
    private runId: string,
  ) {}

  async execute(task: Task): Promise<TaskResult> {
    console.log(
      `[task/executor] Agent-based execution for task ${task.id} (${task.type})`,
    );
    return this.agent.executeTask(task, {
      runId: this.runId,
      dependencies: [],
    });
  }
}
