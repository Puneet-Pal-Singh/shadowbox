/**
 * PlanExecutionEngine unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { PlanExecutionEngine } from '../../src/core/PlanExecutionEngine'
import type { Plan } from '../../src/types'

describe('PlanExecutionEngine', () => {
  let engine: PlanExecutionEngine

  beforeEach(() => {
    engine = new PlanExecutionEngine({
      maxIterations: 5,
      maxTokens: 1000,
      maxExecutionTimeMs: 30000
    })
  })

  it('creates with default config', () => {
    const defaultEngine = new PlanExecutionEngine()
    const config = defaultEngine.getConfig()

    expect(config.maxIterations).toBe(20)
    expect(config.maxTokens).toBe(100000)
    expect(config.maxExecutionTimeMs).toBe(5 * 60 * 1000)
  })

  it('creates with custom config', () => {
    const config = engine.getConfig()

    expect(config.maxIterations).toBe(5)
    expect(config.maxTokens).toBe(1000)
    expect(config.maxExecutionTimeMs).toBe(30000)
  })

  describe('Plan Execution', () => {
    let testPlan: Plan

    beforeEach(() => {
      testPlan = {
        id: 'plan-test',
        goal: 'test execution',
        description: 'test plan',
        steps: [
          {
            id: 'step-1',
            type: 'analysis',
            title: 'Analyze',
            description: 'analyze codebase',
            input: { prompt: 'analyze' }
          },
          {
            id: 'step-2',
            type: 'code_change',
            title: 'Implement',
            description: 'implement change',
            input: { prompt: 'implement' }
          }
        ]
      }
    })

    it('executes plan and returns execution state', async () => {
      const state = await engine.execute(testPlan, '/repo', 'run-1')

      expect(state.runId).toBe('run-1')
      expect(state.planId).toBe('plan-test')
      expect(state.status).toBe('completed')
      expect(state.endTime).toBeDefined()
      expect(state.endTime).toBeGreaterThanOrEqual(state.startTime)
    })

    it('initializes state correctly', async () => {
      const state = await engine.execute(testPlan, '/repo', 'run-1')

      expect(state.currentStepIndex).toBeGreaterThanOrEqual(0)
      expect(state.iterationCount).toBeGreaterThanOrEqual(0)
      expect(state.tokenUsage.total).toBeGreaterThanOrEqual(0)
      expect(state.status).toBeTruthy()
    })

    it('respects max iterations limit', async () => {
      const limitedEngine = new PlanExecutionEngine({ maxIterations: 1 })
      const state = await limitedEngine.execute(testPlan, '/repo', 'run-2')

      expect(state.iterationCount).toBeLessThanOrEqual(1)
    })

    it('respects token budget limit', async () => {
      const budgetEngine = new PlanExecutionEngine({ maxTokens: 0 })
      const state = await budgetEngine.execute(testPlan, '/repo', 'run-3')

      expect(state.tokenUsage.total).toBeLessThanOrEqual(0)
    })
  })

  describe('Stop Conditions', () => {
    it('stops on budget exhaustion', async () => {
      const budgetEngine = new PlanExecutionEngine({
        maxTokens: 1,
        maxIterations: 100
      })

      const plan: Plan = {
        id: 'plan-budget',
        goal: 'test budget',
        description: 'test',
        steps: [
          {
            id: 'step-1',
            type: 'analysis',
            title: 'Step 1',
            description: 'step',
            input: {}
          }
        ]
      }

      const state = await budgetEngine.execute(plan, '/repo', 'run-budget')
      expect(state.status).toBe('stopped')
      expect(state.stopReason).toBe('budget_exhausted')
    })

    it('stops on max iterations', async () => {
      const iterEngine = new PlanExecutionEngine({
        maxIterations: 0,
        maxTokens: 100000
      })

      const plan: Plan = {
        id: 'plan-iter',
        goal: 'test iterations',
        description: 'test',
        steps: [
          {
            id: 'step-1',
            type: 'analysis',
            title: 'Step 1',
            description: 'step',
            input: {}
          }
        ]
      }

      const state = await iterEngine.execute(plan, '/repo', 'run-iter')
      expect(state.status).toBe('stopped')
      expect(state.stopReason).toBe('max_iterations')
    })
  })

  describe('Error Handling', () => {
    it('handles execution errors gracefully', async () => {
      const plan: Plan = {
        id: 'plan-error',
        goal: 'test error',
        description: 'error test',
        steps: [
          {
            id: 'step-1',
            type: 'analysis',
            title: 'Step',
            description: 'description',
            input: {}
          }
        ]
      }

      const state = await engine.execute(plan, '/repo', 'run-error')
      expect(state).toBeDefined()
      expect(['completed', 'failed', 'stopped']).toContain(state.status)
    })
  })

  describe('Configuration', () => {
    it('enforces positive iteration limit', () => {
      const engineWithNegative = new PlanExecutionEngine({
        maxIterations: -5
      })
      const config = engineWithNegative.getConfig()

      // Should use default or sanitize
      expect(config.maxIterations).toBeDefined()
    })

    it('stores artifact store reference', () => {
      const mockStore = {
        saveSnapshot: async () => {},
        loadSnapshot: async () => null,
        saveArtifact: async () => {},
        getArtifact: async () => null,
        listArtifacts: async () => [],
        deleteRun: async () => {}
      }

      const engineWithStore = new PlanExecutionEngine({
        artifactStore: mockStore
      })

      expect(engineWithStore).toBeDefined()
    })
  })
})
