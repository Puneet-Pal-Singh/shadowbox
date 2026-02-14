/**
 * Execution Context Manager
 * Manages execution context across steps, accumulates memory
 */

import type {
  Plan,
  Step,
  ExecutionContext,
  MemoryBlock,
  StepResult
} from '../types/index.js'
import { createExecutionContext } from '../types/index.js'

export class ExecutionContextManager {
  private context: ExecutionContext
  private memoryBlocks: Map<string, MemoryBlock> = new Map()
  private stepOutputs: Map<string, unknown> = new Map()

  constructor(
    private plan: Plan,
    private repoPath: string,
    private runId: string,
    private taskId: string,
    private environment: Record<string, string> = {}
  ) {
    // Initialize with first step
    const firstStep = plan.steps[0]
    if (!firstStep) {
      throw new Error('Plan must contain at least one step')
    }

    this.context = createExecutionContext(
      runId,
      taskId,
      repoPath,
      firstStep,
      {},
      [],
      environment
    )
  }

  /**
   * Initialize context (snapshot repo state, etc.)
   */
  initialize(): ExecutionContext {
    // Placeholder for repo snapshotting
    return this.context
  }

  /**
   * Update context from step result
   * Accumulates outputs for next step
   */
  updateFromStepResult(stepId: string, result: StepResult): void {
    // Store step output
    if (result.output !== undefined) {
      this.stepOutputs.set(stepId, result.output)
      if (typeof result.output === 'object' && result.output !== null) {
        Object.assign(
          this.context.previousStepOutputs,
          result.output as Record<string, unknown>
        )
      }
    }

    // Update token usage if available in output
    if (
      result.output &&
      typeof result.output === 'object' &&
      'tokenUsage' in result.output
    ) {
      const usage = (result.output as Record<string, unknown>).tokenUsage
      if (typeof usage === 'object' && usage !== null) {
        const tokenObj = usage as Record<string, unknown>
        if (typeof tokenObj.input === 'number') {
          this.context.previousStepOutputs[`${stepId}_input_tokens`] = tokenObj.input
        }
        if (typeof tokenObj.output === 'number') {
          this.context.previousStepOutputs[`${stepId}_output_tokens`] = tokenObj.output
        }
      }
    }
  }

  /**
   * Get context for next step
   */
  getContextForStep(step: Step): ExecutionContext {
    // Create immutable copy for this step
    return createExecutionContext(
      this.context.runId,
      this.context.taskId,
      this.context.repoPath,
      step,
      Object.freeze({ ...this.context.previousStepOutputs }),
      [...this.memoryBlocks.values()],
      this.context.environment
    )
  }

  /**
   * Add memory block (accumulates across steps)
   */
  addMemory(stepId: string, key: string, value: unknown, mutable: boolean = false): void {
    const block: MemoryBlock = {
      stepId,
      key,
      value,
      timestamp: Date.now(),
      mutable
    }
    this.memoryBlocks.set(key, block)

    // Also add to previousStepOutputs for easy access
    this.context.previousStepOutputs[`memory_${key}`] = value
  }

  /**
   * Get memory value by key
   */
  getMemory(key: string): unknown {
    const block = this.memoryBlocks.get(key)
    return block?.value
  }

  /**
   * Get all memory blocks
   */
  getAllMemory(): MemoryBlock[] {
    return Array.from(this.memoryBlocks.values())
  }

  /**
   * Get previous step outputs
   */
  getPreviousStepOutputs(): Record<string, unknown> {
    return { ...this.context.previousStepOutputs }
  }

  /**
   * Get step output by step ID
   */
  getStepOutput(stepId: string): unknown {
    return this.stepOutputs.get(stepId)
  }

  /**
   * Clear memory (use with caution)
   */
  clearMemory(): void {
    this.memoryBlocks.clear()
  }
}
