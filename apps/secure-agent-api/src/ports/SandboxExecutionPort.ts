/**
 * SandboxExecutionPort - Boundary for sandbox task execution.
 *
 * Abstracts the actual execution environment (Cloudflare sandbox, WebContainer, local, etc.)
 * from the core agent runtime logic.
 *
 * Canonical alignment: ExecutionSandboxPort (Charter 46)
 */

export interface TaskExecutionInput {
  taskId: string;
  action: string;
  params: Record<string, unknown>;
  timeout?: number;
  retryable?: boolean;
}

export interface TaskExecutionResult {
  taskId: string;
  status: "success" | "failure" | "timeout" | "cancelled";
  output?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metrics?: {
    duration: number;
    memoryUsed?: number;
  };
}

export interface TaskExecutionHooks {
  onLog?: (entry: {
    message: string;
    source?: "stdout" | "stderr";
  }) => Promise<void> | void;
}

/**
 * Port for executing tasks in a sandbox environment.
 * Abstracts sandbox primitives and execution platform.
 */
export interface SandboxExecutionPort {
  /**
   * Execute a single task in the sandbox.
   *
   * @param sessionId - Session identifier
   * @param input - Task input with action, params, and context
   * @returns Task result with status and output
   */
  executeTask(
    sessionId: string,
    input: TaskExecutionInput,
    hooks?: TaskExecutionHooks,
  ): Promise<TaskExecutionResult>;

  /**
   * Cancel an ongoing task execution.
   *
   * @param sessionId - Session identifier
   * @param taskId - Task identifier to cancel
   * @returns true if cancellation was successful
   */
  cancelTask(sessionId: string, taskId: string): Promise<boolean>;

  /**
   * Get sandbox health status.
   *
   * @param sessionId - Session identifier
   * @returns Health status
   */
  getHealth(sessionId: string): Promise<{
    healthy: boolean;
    memoryUsed?: number;
    cpuUsage?: number;
  }>;

  /**
   * Clean up sandbox resources.
   *
   * @param sessionId - Session identifier
   */
  cleanup(sessionId: string): Promise<void>;
}
