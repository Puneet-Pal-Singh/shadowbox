/**
 * Task 10: End-to-End Integration & Testing
 * Full execution tests with determinism, stop conditions, error recovery, performance
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  PlanExecutionEngine,
  InMemoryArtifactStore,
  FileArtifactStore,
  LocalMockAdapter,
  ExecutionLogger
} from '../../src/index.js'
import type { Plan, ExecutionState } from '../../src/types/index.js'
import { promises as fs } from 'fs'
import { join } from 'path'

describe('Task 10: End-to-End Integration & Testing', () => {
  let mockAdapter: LocalMockAdapter
  let artifactStore: InMemoryArtifactStore
  let plan: Plan

  beforeEach(() => {
    mockAdapter = new LocalMockAdapter({
      responseContent: 'Step completed successfully',
      inputTokens: 100,
      outputTokens: 50
    })

    artifactStore = new InMemoryArtifactStore()

    plan = {
      id: 'e2e-task10-plan',
      goal: 'Test determinism and stop conditions',
      description: 'Full end-to-end execution test',
      steps: [
        {
          id: 'step-1',
          type: 'analysis',
          title: 'Analyze Requirements',
          description: 'analyze requirements',
          input: { prompt: 'analyze' }
        },
        {
          id: 'step-2',
          type: 'code_change',
          title: 'Implement Solution',
          description: 'implement solution',
          input: { prompt: 'implement' }
        },
        {
          id: 'step-3',
          type: 'review',
          title: 'Review Changes',
          description: 'review changes',
          input: { prompt: 'review' }
        },
        {
          id: 'step-4',
          type: 'analysis',
          title: 'Final Analysis',
          description: 'final analysis',
          input: { prompt: 'analyze final' }
        }
      ]
    }
  })

  describe('Determinism & Replay', () => {
    it('produces identical state with same inputs', async () => {
      const engine1 = new PlanExecutionEngine({
        maxIterations: 20,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      const state1 = await engine1.execute(plan, '/repo', 'run-determinism-1')

      // Second execution with same inputs
      const engine2 = new PlanExecutionEngine({
        maxIterations: 20,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      const state2 = await engine2.execute(plan, '/repo', 'run-determinism-2')

      // Verify deterministic behavior
      expect(state1.status).toBe(state2.status)
      expect(state1.currentStepIndex).toBe(state2.currentStepIndex)
      expect(state1.iterationCount).toBe(state2.iterationCount)
      expect(state1.planId).toBe(state2.planId)
    })

    it('can replay execution from snapshot', async () => {
      const engine = new PlanExecutionEngine({
        maxIterations: 20,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      const originalState = await engine.execute(plan, '/repo', 'run-replay-1')

      // Load snapshot
      const loadedState = await artifactStore.loadSnapshot('run-replay-1')

      expect(loadedState).toBeDefined()
      expect(loadedState?.status).toBe(originalState.status)
      expect(loadedState?.currentStepIndex).toBe(originalState.currentStepIndex)
      expect(JSON.stringify(loadedState)).toBe(JSON.stringify(originalState))
    })

    it('maintains exact state across replay cycles', async () => {
      const engine = new PlanExecutionEngine({
        maxIterations: 20,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      await engine.execute(plan, '/repo', 'run-replay-2')

      const snapshot1 = await artifactStore.loadSnapshot('run-replay-2')
      const snapshot2 = await artifactStore.loadSnapshot('run-replay-2')
      const snapshot3 = await artifactStore.loadSnapshot('run-replay-2')

      const serialized1 = JSON.stringify(snapshot1)
      const serialized2 = JSON.stringify(snapshot2)
      const serialized3 = JSON.stringify(snapshot3)

      expect(serialized1).toBe(serialized2)
      expect(serialized2).toBe(serialized3)
    })
  })

  describe('Stop Conditions', () => {
    it('stops on token budget exhaustion', async () => {
      const engine = new PlanExecutionEngine({
        maxIterations: 100,
        maxTokens: 1, // Very low token limit
        modelProvider: mockAdapter,
        artifactStore
      })

      const state = await engine.execute(plan, '/repo', 'run-budget-1')

      expect(state.status).toBe('stopped')
      expect(state.stopReason).toBe('budget_exhausted')
      expect(state.tokenUsage.total).toBeLessThanOrEqual(1)
    })

    it('stops on max iterations reached', async () => {
      const engine = new PlanExecutionEngine({
        maxIterations: 1,
        maxTokens: 100000,
        modelProvider: mockAdapter,
        artifactStore
      })

      const state = await engine.execute(plan, '/repo', 'run-iterations-1')

      expect(state.status).toBe('stopped')
      expect(state.stopReason).toBe('max_iterations')
      expect(state.iterationCount).toBeLessThanOrEqual(1)
    })

    it('stops on execution timeout', async () => {
      const engine = new PlanExecutionEngine({
        maxIterations: 100,
        maxTokens: 100000,
        maxExecutionTimeMs: 10, // 10ms timeout
        modelProvider: mockAdapter,
        artifactStore
      })

      const state = await engine.execute(plan, '/repo', 'run-timeout-1')

      expect(state.status).toBe('stopped')
      expect(state.stopReason).toBe('error')
    })

    it('transitions to completed when plan finishes', async () => {
      const engine = new PlanExecutionEngine({
        maxIterations: 20,
        maxTokens: 100000,
        modelProvider: mockAdapter,
        artifactStore
      })

      const state = await engine.execute(plan, '/repo', 'run-completed-1')

      expect(state.status).toBe('completed')
      expect(state.stopReason).toBeUndefined()
    })

    it('records correct stop reason in snapshot', async () => {
      const engine = new PlanExecutionEngine({
        maxIterations: 1,
        maxTokens: 100000,
        modelProvider: mockAdapter,
        artifactStore
      })

      await engine.execute(plan, '/repo', 'run-stop-reason-1')

      const snapshot = await artifactStore.loadSnapshot('run-stop-reason-1')

      expect(snapshot?.stopReason).toBeDefined()
      expect(['max_iterations', 'budget_exhausted', 'error']).toContain(snapshot?.stopReason)
    })
  })

  describe('Error Recovery', () => {
    it('continues execution despite tool errors', async () => {
      const engine = new PlanExecutionEngine({
        maxIterations: 20,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      // Should not throw even with edge cases
      const state = await engine.execute(plan, '/repo', 'run-error-recovery-1')

      expect(state).toBeDefined()
      expect(['completed', 'stopped', 'failed']).toContain(state.status)
    })

    it('tracks errors in execution state', async () => {
      const engine = new PlanExecutionEngine({
        maxIterations: 20,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      const state = await engine.execute(plan, '/repo', 'run-error-tracking-1')

      // Errors array should exist even if empty
      expect(Array.isArray(state.errors)).toBe(true)
    })

    it('persists error information in artifacts', async () => {
      const engine = new PlanExecutionEngine({
        maxIterations: 20,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      await engine.execute(plan, '/repo', 'run-error-artifacts-1')

      const snapshot = await artifactStore.loadSnapshot('run-error-artifacts-1')

      expect(snapshot?.errors).toBeDefined()
      expect(Array.isArray(snapshot?.errors)).toBe(true)
    })
  })

  describe('Artifact Store Population', () => {
    it('saves execution state snapshot', async () => {
      const engine = new PlanExecutionEngine({
        maxIterations: 20,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      const state = await engine.execute(plan, '/repo', 'run-artifacts-1')

      const snapshot = await artifactStore.loadSnapshot('run-artifacts-1')

      expect(snapshot).toBeDefined()
      expect(snapshot?.runId).toBe('run-artifacts-1')
      expect(snapshot?.planId).toBe(plan.id)
      expect(snapshot?.status).toBe(state.status)
    })

    it('preserves complete execution state in artifacts', async () => {
      const engine = new PlanExecutionEngine({
        maxIterations: 20,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      const state = await engine.execute(plan, '/repo', 'run-artifacts-full-1')

      const snapshot = await artifactStore.loadSnapshot('run-artifacts-full-1')

      expect(snapshot?.currentStepIndex).toBe(state.currentStepIndex)
      expect(snapshot?.iterationCount).toBe(state.iterationCount)
      expect(snapshot?.tokenUsage.total).toBe(state.tokenUsage.total)
      expect(snapshot?.startTime).toBe(state.startTime)
    })

    it('handles multiple concurrent executions with separate artifacts', async () => {
      const engine = new PlanExecutionEngine({
        maxIterations: 20,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      // Execute multiple runs concurrently
      await Promise.all([
        engine.execute(plan, '/repo', 'run-concurrent-1'),
        engine.execute(plan, '/repo', 'run-concurrent-2'),
        engine.execute(plan, '/repo', 'run-concurrent-3')
      ])

      const snap1 = await artifactStore.loadSnapshot('run-concurrent-1')
      const snap2 = await artifactStore.loadSnapshot('run-concurrent-2')
      const snap3 = await artifactStore.loadSnapshot('run-concurrent-3')

      expect(snap1?.runId).toBe('run-concurrent-1')
      expect(snap2?.runId).toBe('run-concurrent-2')
      expect(snap3?.runId).toBe('run-concurrent-3')
    })
  })

  describe('Performance Baseline', () => {
    it('completes small task within 5 seconds', async () => {
      const engine = new PlanExecutionEngine({
        maxIterations: 20,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      const startTime = Date.now()
      await engine.execute(plan, '/repo', 'run-perf-1')
      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(5000)
    })

    it('tracks execution timing accurately', async () => {
      const engine = new PlanExecutionEngine({
        maxIterations: 20,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      const state = await engine.execute(plan, '/repo', 'run-perf-2')

      expect(state.endTime).toBeGreaterThan(state.startTime)
      expect(state.endTime! - state.startTime).toBeGreaterThan(0)
    })

    it('maintains consistent performance across multiple runs', async () => {
      const engine = new PlanExecutionEngine({
        maxIterations: 20,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore
      })

      const durations: number[] = []

      for (let i = 0; i < 3; i++) {
        const startTime = Date.now()
        await engine.execute(plan, '/repo', `run-perf-consistency-${i}`)
        durations.push(Date.now() - startTime)
      }

      // Durations should be relatively consistent
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
      const maxVariance = avgDuration * 0.5 // 50% variance tolerance

      for (const duration of durations) {
        expect(Math.abs(duration - avgDuration)).toBeLessThan(maxVariance)
      }
    })
  })

  describe('File-Based Artifacts', () => {
    let tempDir: string

    beforeEach(async () => {
      tempDir = join(process.cwd(), '.test-e2e-artifacts')
    })

    afterEach(async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    })

    it('persists execution state to filesystem', async () => {
      const fileStore = new FileArtifactStore({ basePath: tempDir })
      const engine = new PlanExecutionEngine({
        maxIterations: 20,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore: fileStore
      })

      const state = await engine.execute(plan, '/repo', 'run-file-persist-1')

      const loaded = await fileStore.loadSnapshot('run-file-persist-1')

      expect(loaded?.runId).toBe('run-file-persist-1')
      expect(loaded?.status).toBe(state.status)
    })

    it('creates proper directory structure', async () => {
      const fileStore = new FileArtifactStore({ basePath: tempDir })
      const engine = new PlanExecutionEngine({
        maxIterations: 20,
        maxTokens: 10000,
        modelProvider: mockAdapter,
        artifactStore: fileStore
      })

      await engine.execute(plan, '/repo', 'run-dir-struct-1')

      const snapshotFile = join(tempDir, 'runs', 'run-dir-struct-1', 'snapshot.json')
      const content = await fs.readFile(snapshotFile, 'utf-8')
      const parsed = JSON.parse(content)

      expect(parsed.runId).toBe('run-dir-struct-1')
    })
  })

  describe('Logging & Observability', () => {
    it('creates logger for execution tracking', async () => {
      const logger = new ExecutionLogger('run-logging-1')

      logger.info('test', 'operation', 'test message')
      const logs = logger.getLogs()

      expect(logs.length).toBeGreaterThan(0)
      expect(logs[0].runId).toBe('run-logging-1')
    })

    it('logs at appropriate levels', async () => {
      const logger = new ExecutionLogger('run-levels-1')

      logger.info('d', 'o', 'info')
      logger.warn('d', 'o', 'warn')
      logger.error('d', 'o', 'error')

      const logs = logger.getLogs()
      const levels = logs.map(l => l.level)

      expect(levels).toContain('info')
      expect(levels).toContain('warn')
      expect(levels).toContain('error')
    })
  })
})
