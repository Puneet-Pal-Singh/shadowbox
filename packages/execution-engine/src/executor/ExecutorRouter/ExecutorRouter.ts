/**
 * ExecutorRouter - Route execution tasks to appropriate executor
 *
 * SOLID Principles:
 * - SRP: Only responsible for executor selection
 * - OCP: Extensible for new executors via registry
 * - LSP: All executors implement Executor interface
 * - ISP: Router depends on minimal Executor contract
 * - DIP: Depends on Executor abstraction, not concrete implementations
 */

import type { Executor } from '../Executor.js'
import type { ExecutionTask, ExecutionEnvironment } from '../../types/executor.js'

/**
 * Executor selection hints
 * Used to choose between available executors
 */
export type ExecutorHint = 'docker' | 'cloud' | 'local'

/**
 * Task routing decision
 * Determines which executor to use
 */
export interface RoutingDecision {
  executorId: ExecutorHint
  reason: string
  confidence: number // 0-1, where 1 is high confidence
}

/**
 * ExecutorRouter: Single responsibility = route tasks to correct executor
 * Does NOT create executors, manage state, or track costs
 */
export class ExecutorRouter {
  /**
   * Registry of available executors
   * Map<executorId, executor instance>
   */
  private readonly executors: Map<ExecutorHint, Executor>

  constructor(executorRegistry: Map<ExecutorHint, Executor>) {
    this.validateRegistry(executorRegistry)
    this.executors = executorRegistry
  }

  /**
   * Route a task to the best executor
   * Uses hints from task and returns routing decision
   */
  selectExecutor(task: ExecutionTask): RoutingDecision {
    // Try to use hint if provided
    if (task.executorHint && this.executors.has(task.executorHint)) {
      return {
        executorId: task.executorHint,
        reason: 'User specified executor hint',
        confidence: 1.0
      }
    }

    // Fall back to auto-selection based on task characteristics
    return this.autoSelectExecutor(task)
  }

  /**
   * Get executor by ID
   * Throws if executor not found
   */
  getExecutor(executorId: ExecutorHint): Executor {
    const executor = this.executors.get(executorId)
    if (!executor) {
      throw new Error(`Executor not found: ${executorId}`)
    }
    return executor
  }

  /**
   * List available executors
   */
  listAvailableExecutors(): ExecutorHint[] {
    return Array.from(this.executors.keys())
  }

  /**
   * Auto-select executor based on task characteristics
   * Priority: cloud > docker > local
   */
  private autoSelectExecutor(task: ExecutionTask): RoutingDecision {
    // If task requires GPU, prefer cloud
    if (task.requiresGPU && this.executors.has('cloud')) {
      return {
        executorId: 'cloud',
        reason: 'Task requires GPU acceleration',
        confidence: 0.9
      }
    }

    // If task is large/long-running, prefer cloud
    if (task.estimatedDuration && task.estimatedDuration > 300000) {
      if (this.executors.has('cloud')) {
        return {
          executorId: 'cloud',
          reason: 'Long-running task routed to cloud',
          confidence: 0.8
        }
      }
    }

    // Default to docker if available, then cloud, then local
    if (this.executors.has('docker')) {
      return {
        executorId: 'docker',
        reason: 'Default to Docker for local execution',
        confidence: 0.7
      }
    }

    if (this.executors.has('cloud')) {
      return {
        executorId: 'cloud',
        reason: 'Cloud is fallback executor',
        confidence: 0.6
      }
    }

    if (this.executors.has('local')) {
      return {
        executorId: 'local',
        reason: 'Local is last resort',
        confidence: 0.5
      }
    }

    throw new Error('No executors registered')
  }

  /**
   * Validate registry is not empty
   */
  private validateRegistry(registry: Map<ExecutorHint, Executor>): void {
    if (registry.size === 0) {
      throw new Error('ExecutorRouter requires at least one registered executor')
    }
  }
}
