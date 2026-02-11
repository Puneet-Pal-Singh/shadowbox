/**
 * Environment Manager - Abstract base for executor lifecycle
 * Template method pattern: subclasses override _executeImpl()
 *
 * SOLID:
 * - SRP: Single responsibility = lifecycle management (create → execute → destroy)
 * - Template Method: DRY code reuse for timeout, logging, error handling
 */

import type {
  Executor,
  ExecutionEnvironment,
  ExecutionTask,
  ExecutionResult,
  ExecutionLog
} from '../types/executor.js'
import type { EnvironmentConfig } from '../types/executor.js'

/**
 * Abstract base class for executor implementations
 * Handles common lifecycle concerns: timeout, logging, error handling
 *
 * Template Method pattern:
 * - Public methods (execute) define the algorithm
 * - Protected abstract methods (_executeImpl) let subclasses provide details
 */
export abstract class EnvironmentManager implements Executor {
  /**
   * Subclasses must provide a human-readable name
   */
  abstract readonly name: string

  /**
   * Subclasses implement environment creation
   */
  abstract createEnvironment(config: EnvironmentConfig): Promise<ExecutionEnvironment>

  /**
   * Subclasses implement the actual execution logic
   * Protected to hide implementation from public API
   */
  protected abstract _executeImpl(
    env: ExecutionEnvironment,
    task: ExecutionTask
  ): Promise<ExecutionResult>

  /**
   * Execute task with shared concerns: timeout, logging, error handling
   * Template method: orchestrates common logic, delegates to _executeImpl()
   *
   * @throws If task execution fails
   */
  async executeTask(env: ExecutionEnvironment, task: ExecutionTask): Promise<ExecutionResult> {
    const startTime = Date.now()

    try {
      const result = await this._executeImpl(env, task)
      const duration = Date.now() - startTime

      // Ensure duration is always set
      result.duration = Math.max(result.duration, duration)

      return result
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Log error with context
      console.error(
        `[executor/${this.name.toLowerCase()}] Task execution failed after ${duration}ms:`,
        errorMessage
      )

      throw error
    }
  }

  /**
   * Subclasses implement log streaming
   */
  abstract streamLogs(env: ExecutionEnvironment): Promise<AsyncIterable<ExecutionLog>>

  /**
   * Subclasses implement environment cleanup
   */
  abstract destroyEnvironment(env: ExecutionEnvironment): Promise<void>
}
