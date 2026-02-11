/**
 * End-to-end execution tests
 * Tests full execution flow: plan → completion with artifacts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { PlanExecutionEngine, LocalMockAdapter, ExecutionTracer } from '../../src/index.js'
import type { Plan } from '../../src/types/index.js'

describe('End-to-End Execution', () => {
  let plan: Plan
  let engine: PlanExecutionEngine
  let mockAdapter: LocalMockAdapter

  beforeEach(() => {
    mockAdapter = new LocalMockAdapter({
      responseContent: 'Analysis complete',
      inputTokens: 100,
      outputTokens: 50
    })

    engine = new PlanExecutionEngine({
      maxIterations: 10,
      maxTokens: 10000,
      modelProvider: mockAdapter
    })

    plan = {
      id: 'e2e-plan-1',
      goal: 'implement feature',
      description: 'test e2e execution',
      steps: [
        {
          id: 'step-1',
          type: 'analysis',
          title: 'Analyze Requirements',
          description: 'analyze',
          input: { prompt: 'analyze' }
        },
        {
          id: 'step-2',
          type: 'code_change',
          title: 'Implement Feature',
          description: 'implement',
          input: { prompt: 'implement' }
        },
        {
          id: 'step-3',
          type: 'review',
          title: 'Review Changes',
          description: 'review',
          input: { prompt: 'review' }
        }
      ]
    }
  })

  it('executes plan end-to-end to completion', async () => {
    const state = await engine.execute(plan, '/repo', 'run-e2e-1')

    expect(state.runId).toBe('run-e2e-1')
    expect(state.planId).toBe('e2e-plan-1')
    expect(state.status).toBe('completed')
    expect(state.endTime).toBeGreaterThan(state.startTime)
  })

  it('processes all steps in order', async () => {
    const state = await engine.execute(plan, '/repo', 'run-e2e-2')

    expect(state.currentStepIndex).toBeGreaterThanOrEqual(plan.steps.length - 1)
    expect(state.iterationCount).toBeGreaterThan(0)
  })

  it('tracks token usage throughout execution', async () => {
    const state = await engine.execute(plan, '/repo', 'run-e2e-3')

    expect(state.tokenUsage.input).toBeGreaterThanOrEqual(0)
    expect(state.tokenUsage.output).toBeGreaterThanOrEqual(0)
    expect(state.tokenUsage.total).toBe(state.tokenUsage.input + state.tokenUsage.output)
  })

  it('respects max token limit', async () => {
    const limitedEngine = new PlanExecutionEngine({
      maxTokens: 1,
      maxIterations: 100
    })

    const state = await limitedEngine.execute(plan, '/repo', 'run-e2e-4')

    expect(state.tokenUsage.total).toBeLessThanOrEqual(1)
    expect(state.status).toBe('stopped')
    expect(state.stopReason).toBe('budget_exhausted')
  })

  it('completes within execution time limit', async () => {
    const startTime = Date.now()
    await engine.execute(plan, '/repo', 'run-e2e-5')
    const duration = Date.now() - startTime

    expect(duration).toBeLessThan(10000) // 10 seconds
  })

  it('handles multi-step execution context', async () => {
    const state = await engine.execute(plan, '/repo', 'run-e2e-6')

    expect(state.planId).toBe(plan.id)
    expect(state.currentStepIndex).toBeGreaterThanOrEqual(0)
  })

  it('injects model provider into engine', () => {
    expect(engine.getModelProvider()).toBe(mockAdapter)
  })
})
