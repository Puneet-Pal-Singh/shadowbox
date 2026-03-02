/**
 * ExecutionRuntimePort - Boundary for execution and orchestration dependencies.
 *
 * This port abstracts the communication between the Brain control plane and the
 * Muscle data plane (Secure Agent API). It owns task execution, orchestration,
 * and the execution lifecycle.
 *
 * Canonical alignment: ExecutionSandboxPort + RunOrchestratorPort (Charter 46)
 */

// NOTE: TaskInput/TaskResult types are defined in secure-agent-api
// and should be imported from there for Brain -> Muscle integration
export interface TaskInput {
  taskId: string;
  action: string;
  params: Record<string, unknown>;
  timeout?: number;
  retryable?: boolean;
}

export interface TaskResult {
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

/**
 * Port for executing tasks in a sandbox environment.
 * Abstracts Cloudflare sandbox primitives and future alternative executors.
 */
export interface ExecutionSandboxPort {
  /**
   * Execute a single task in the sandbox.
   *
   * @param runId - Unique run identifier
   * @param input - Task input with action, parameters, and context
   * @returns Task result with status, output, or error
   */
  executeTask(runId: string, input: TaskInput): Promise<TaskResult>;

  /**
   * Cancel an ongoing task execution.
   *
   * @param runId - Unique run identifier
   * @param taskId - Task identifier to cancel
   * @returns true if cancellation was successful
   */
  cancelTask(runId: string, taskId: string): Promise<boolean>;
}

/**
 * Port for managing run orchestration and state transitions.
 * Owns run lifecycle, scheduling, and deterministic execution ordering.
 */
export interface RunOrchestratorPort {
  /**
   * Get the current state of a run.
   *
   * @param runId - Unique run identifier
   * @returns Run state or null if not found
   */
  getRunState(runId: string): Promise<{
    runId: string;
    status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
    createdAt: number;
    updatedAt: number;
  } | null>;

  /**
   * Transition a run to a new state.
   *
   * @param runId - Unique run identifier
   * @param newStatus - Target status
   */
  transitionRun(
    runId: string,
    newStatus: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED",
  ): Promise<void>;

  /**
   * Schedule the next task for execution.
   *
   * @param runId - Unique run identifier
   * @returns Next task to execute or null if none pending
   */
  scheduleNext(runId: string): Promise<{ taskId: string; input: TaskInput } | null>;
}

/**
 * Composite port for complete execution runtime.
 * Combines sandbox execution and orchestration concerns.
 */
export interface ExecutionRuntimePort
  extends ExecutionSandboxPort,
    RunOrchestratorPort {}
