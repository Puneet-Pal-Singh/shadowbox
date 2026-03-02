/**
 * CloudflareSandboxExecutionAdapter - Implements SandboxExecutionPort using Cloudflare Sandbox.
 *
 * Adapts Cloudflare sandbox primitives to the canonical SandboxExecutionPort interface.
 * Encapsulates plugin execution, error handling, and health monitoring.
 *
 * Canonical alignment: ExecutionSandboxPort (Charter 46)
 */

import { Sandbox } from "@cloudflare/sandbox";
import {
  SandboxExecutionPort,
  TaskExecutionInput,
  TaskExecutionResult,
} from "../ports/SandboxExecutionPort";
import { IPlugin } from "../interfaces/types";

/**
 * Maps task action to plugin name and method.
 * Ensures deterministic routing of tasks to correct plugins.
 */
interface TaskActionMapping {
  pluginName: string;
  method: string;
}

/**
 * Tracks active task executions for cancellation support.
 */
interface ActiveTaskExecution {
  taskId: string;
  abortController: AbortController;
  startTime: number;
}

export class CloudflareSandboxExecutionAdapter implements SandboxExecutionPort {
  private activeExecutions = new Map<string, ActiveTaskExecution>();
  private taskTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private sandbox: Sandbox,
    private plugins: Map<string, IPlugin>,
  ) {}

  /**
   * Execute a single task by routing to the appropriate plugin.
   * Implements timeout, abort, and error handling.
   */
  async executeTask(
    sessionId: string,
    input: TaskExecutionInput,
  ): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    const abortController = new AbortController();
    const activeTask: ActiveTaskExecution = {
      taskId: input.taskId,
      abortController,
      startTime,
    };

    this.activeExecutions.set(input.taskId, activeTask);

    try {
      // Determine timeout: use provided, or fallback to 30s
      const timeout = input.timeout ?? 30000;

      // Set up timeout cleanup
      const timeoutHandle = setTimeout(() => {
        abortController.abort();
        this.activeExecutions.delete(input.taskId);
      }, timeout);

      this.taskTimeouts.set(input.taskId, timeoutHandle);

      // Route task to appropriate plugin
      const mapping = this.getTaskActionMapping(input.action);
      if (!mapping) {
        return {
          taskId: input.taskId,
          status: "failure",
          error: {
            code: "UNKNOWN_ACTION",
            message: `Unknown task action: ${input.action}`,
          },
        };
      }

      const plugin = this.plugins.get(mapping.pluginName);
      if (!plugin) {
        return {
          taskId: input.taskId,
          status: "failure",
          error: {
            code: "PLUGIN_NOT_FOUND",
            message: `Plugin not found: ${mapping.pluginName}`,
          },
        };
      }

      // Execute plugin method with session context
      const output = await (plugin as any)[mapping.method](
        sessionId,
        input.params,
        { signal: abortController.signal },
      );

      const duration = Date.now() - startTime;

      return {
        taskId: input.taskId,
        status: "success",
        output: typeof output === "string" ? output : JSON.stringify(output),
        metrics: { duration },
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const error = this.normalizeError(err);

      // Detect timeout vs other errors
      let status: "failure" | "timeout" = "failure";
      if (abortController.signal.aborted && duration >= (input.timeout ?? 30000)) {
        status = "timeout";
      }

      const normalizedError = {
        code: error.code || "EXECUTION_ERROR",
        message: error.message || "Unknown error",
        details: error.details,
      };

      return {
        taskId: input.taskId,
        status,
        error: normalizedError,
        metrics: { duration },
      };
    } finally {
      // Clean up
      this.activeExecutions.delete(input.taskId);
      const timeoutHandle = this.taskTimeouts.get(input.taskId);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        this.taskTimeouts.delete(input.taskId);
      }
    }
  }

  /**
   * Cancel an ongoing task execution.
   * Signals the abort controller to stop the task.
   */
  async cancelTask(sessionId: string, taskId: string): Promise<boolean> {
    const activeTask = this.activeExecutions.get(taskId);
    if (!activeTask) {
      return false; // Task not found or already completed
    }

    activeTask.abortController.abort();
    return true;
  }

  /**
   * Get sandbox health status.
   * Checks if sandbox is operational and resources available.
   */
  async getHealth(
    sessionId: string,
  ): Promise<{ healthy: boolean; memoryUsed?: number; cpuUsage?: number }> {
    try {
      // Basic health check: if plugins are loaded, assume healthy
      const healthy = this.plugins.size > 0;
      return {
        healthy,
        // Cloudflare sandbox doesn't expose detailed metrics
        // in a portable way, so we keep these optional
      };
    } catch {
      return { healthy: false };
    }
  }

  /**
   * Clean up sandbox resources for a session.
   * Called when session ends to free resources.
   */
  async cleanup(sessionId: string): Promise<void> {
    // Cancel any active executions for this session
    // (In a real implementation, we'd track session->taskId mappings)
    // For now, we just ensure timeouts are cleared
    this.taskTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.taskTimeouts.clear();
    this.activeExecutions.clear();
  }

  /**
   * Maps task action strings to plugin method calls.
   * Deterministic routing ensures same action always routes to same plugin.
   */
  private getTaskActionMapping(action: string): TaskActionMapping | null {
    // Standard action patterns: "plugin.method"
    const parts = action.split(".");
    if (parts.length === 2 && parts[0] && parts[1]) {
      return {
        pluginName: parts[0],
        method: parts[1],
      };
    }

    // Legacy mappings for backward compatibility
    const legacyMappings: Record<string, TaskActionMapping> = {
      "read_file": { pluginName: "FileSystem", method: "readFile" },
      "write_file": { pluginName: "FileSystem", method: "writeFile" },
      "git_status": { pluginName: "Git", method: "status" },
      "git_diff": { pluginName: "Git", method: "diff" },
      "execute_python": { pluginName: "Python", method: "execute" },
      "execute_node": { pluginName: "Node", method: "execute" },
      "execute_rust": { pluginName: "Rust", method: "execute" },
    };

    return legacyMappings[action] ?? null;
  }

  /**
   * Normalize error objects to canonical TaskExecutionResult error format.
   */
  private normalizeError(err: unknown): {
    code: string;
    message: string;
    details?: unknown;
  } {
    if (err instanceof Error) {
      const code = (err as any).code || "EXECUTION_ERROR";
      return {
        code: typeof code === "string" ? code : "EXECUTION_ERROR",
        message: err.message,
        details: (err as any).stack,
      };
    }

    if (typeof err === "string") {
      return {
        code: "EXECUTION_ERROR",
        message: err,
      };
    }

    return {
      code: "EXECUTION_ERROR",
      message: "Unknown error during task execution",
      details: err,
    };
  }
}
