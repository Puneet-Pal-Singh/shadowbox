/**
 * Plan Execution Engine - Main orchestration loop
 * Coordinates sequential step execution with state management
 */

import type {
  Plan,
  ExecutionState,
  ExecutionContext,
  StepResult,
  ArtifactStore
} from '../types/index.js'
import { initializeExecutionState } from '../types/index.js'

export interface PlanExecutionEngineConfig {
  maxIterations?: number
  maxExecutionTimeMs?: number
  maxTokens?: number
  artifactStore?: ArtifactStore
}

export class PlanExecutionEngine {
  private maxIterations: number
  private maxExecutionTimeMs: number
  private maxTokens: number
  private artifactStore: ArtifactStore | null

  constructor(config: PlanExecutionEngineConfig = {}) {
    this.maxIterations = config.maxIterations ?? 20
    this.maxExecutionTimeMs = config.maxExecutionTimeMs ?? 5 * 60 * 1000 // 5 minutes
    this.maxTokens = config.maxTokens ?? 100000
    this.artifactStore = config.artifactStore ?? null
  }

  /**
   * Execute a plan with proper state management
   * Placeholder - skeleton for integration testing
   */
  async execute(
    plan: Plan,
    repoPath: string,
    runId: string
  ): Promise<ExecutionState> {
    const state = initializeExecutionState(runId, plan.id)
    state.status = 'running'

    const startTime = Date.now()

    try {
      // Loop through steps sequentially
      for (let i = 0; i < plan.steps.length; i++) {
        // Check stop conditions
        if (this.shouldStop(state, startTime)) {
          break
        }

        state.currentStepIndex = i
        state.iterationCount++

        // In real implementation: execute step, handle tools, etc.
        // For now: just track structure
      }

      // Only set to completed if not already stopped
      if (state.status === 'running') {
        state.status = 'completed'
      }
    } catch (error) {
      state.status = 'failed'
      state.errors.push(error instanceof Error ? error : new Error(String(error)))
    }

    state.endTime = Date.now()

    // Persist final state
    if (this.artifactStore) {
      await this.artifactStore.saveSnapshot(state)
    }

    return state
  }

  /**
   * Check if execution should stop
   */
  private shouldStop(state: ExecutionState, startTime: number): boolean {
    // Budget exhausted
    if (state.tokenUsage.total >= this.maxTokens) {
      state.status = 'stopped'
      state.stopReason = 'budget_exhausted'
      return true
    }

    // Max iterations reached
    if (state.iterationCount >= this.maxIterations) {
      state.status = 'stopped'
      state.stopReason = 'max_iterations'
      return true
    }

    // Timeout exceeded
    if (Date.now() - startTime >= this.maxExecutionTimeMs) {
      state.status = 'stopped'
      state.stopReason = 'error'
      return true
    }

    return false
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return {
      maxIterations: this.maxIterations,
      maxExecutionTimeMs: this.maxExecutionTimeMs,
      maxTokens: this.maxTokens
    }
  }
}
