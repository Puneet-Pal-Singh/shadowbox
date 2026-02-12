// apps/brain/src/core/orchestration/DependencyResolver.ts
// Phase 3C: DAG validation, cycle detection, and dependency resolution

import type { Task } from "../task";
import type { TaskRepository } from "../task";

export interface IDependencyResolver {
  validateDAG(tasks: Task[]): ValidationResult;
  areMet(dependencies: string[], runId: string): Promise<boolean>;
  topologicalSort(tasks: Task[]): Task[];
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  cycle?: string[];
}

/**
 * DependencyResolver manages task dependency validation and resolution.
 * Ensures task dependencies form a valid DAG (Directed Acyclic Graph).
 */
export class DependencyResolver implements IDependencyResolver {
  constructor(private taskRepo: TaskRepository) {}

  /**
   * Validate that tasks form a valid DAG (no cycles)
   */
  validateDAG(tasks: Task[]): ValidationResult {
    // Check for self-references
    for (const task of tasks) {
      if (task.dependencies.includes(task.id)) {
        return {
          valid: false,
          error: `Task ${task.id} has self-reference`,
          cycle: [task.id],
        };
      }
    }

    // Check for cycles using DFS
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    for (const task of tasks) {
      if (!visited.has(task.id)) {
        const cycle = this.detectCycleDFS(
          task.id,
          visited,
          recStack,
          taskMap,
        );
        if (cycle) {
          return {
            valid: false,
            error: `Cycle detected: ${cycle.join(" → ")}`,
            cycle,
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Check if all dependencies for a task are met (DONE status)
   */
  async areMet(dependencies: string[], runId: string): Promise<boolean> {
    if (dependencies.length === 0) {
      return true;
    }

    const depTasks = await this.taskRepo.getByIds(dependencies, runId);

    // Check all requested dependencies exist
    if (depTasks.length !== dependencies.length) {
      console.warn(
        `[dependency/resolver] Missing dependencies: expected ${dependencies.length}, got ${depTasks.length}`,
      );
      return false;
    }

    // Check all dependencies are DONE
    return depTasks.every((task) => task.status === "DONE");
  }

  /**
   * Topologically sort tasks by dependencies (Kahn's algorithm)
   * Returns tasks in execution order (dependencies before dependents)
   */
  topologicalSort(tasks: Task[]): Task[] {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    // Calculate in-degree for each task
    const inDegree = new Map<string, number>();
    for (const task of tasks) {
      if (!inDegree.has(task.id)) {
        inDegree.set(task.id, 0);
      }
      for (const dep of task.dependencies) {
        inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
      }
    }

    // Find all tasks with no dependencies
    const queue: string[] = [];
    for (const task of tasks) {
      if (task.dependencies.length === 0) {
        queue.push(task.id);
      }
    }

    const sorted: Task[] = [];
    while (queue.length > 0) {
      const taskId = queue.shift()!;
      const task = taskMap.get(taskId);
      if (task) {
        sorted.push(task);
      }

      // For each task that depends on this one, reduce its in-degree
      for (const candidate of tasks) {
        if (candidate.dependencies.includes(taskId)) {
          const degree = (inDegree.get(candidate.id) ?? 0) - 1;
          inDegree.set(candidate.id, degree);
          if (degree === 0) {
            queue.push(candidate.id);
          }
        }
      }
    }

    return sorted;
  }

  /**
   * DFS-based cycle detection
   * Returns cycle path if found, null otherwise
   */
  private detectCycleDFS(
    nodeId: string,
    visited: Set<string>,
    recStack: Set<string>,
    taskMap: Map<string, Task>,
  ): string[] | null {
    visited.add(nodeId);
    recStack.add(nodeId);

    const task = taskMap.get(nodeId);
    if (!task) {
      return null;
    }

    for (const depId of task.dependencies) {
      if (!visited.has(depId)) {
        const cycle = this.detectCycleDFS(depId, visited, recStack, taskMap);
        if (cycle) {
          return cycle;
        }
      } else if (recStack.has(depId)) {
        // Back edge found - cycle detected
        return [depId, nodeId];
      }
    }

    recStack.delete(nodeId);
    return null;
  }
}

export class DependencyResolverError extends Error {
  constructor(message: string) {
    super(`[dependency/resolver] ${message}`);
    this.name = "DependencyResolverError";
  }
}
