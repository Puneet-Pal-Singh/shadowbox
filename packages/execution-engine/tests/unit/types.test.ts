/**
 * Type definition tests
 */

import { describe, it, expect } from 'vitest'
import {
  PlanSchema,
  StepSchema,
  ToolCallSchema,
  ExecutionStateSchema,
  ExecutionContextSchema,
  MemoryBlockSchema,
  StepResultSchema,
  ArtifactSchema,
  createExecutionContext,
  initializeExecutionState,
  createStepResult,
  createLogEntry,
  createArtifact
} from '../../src/types'

describe('Plan Types', () => {
  it('validates correct plan', () => {
    const plan = {
      id: 'plan-1',
      goal: 'implement feature',
      description: 'add auth',
      steps: [
        {
          id: 'step-1',
          type: 'analysis' as const,
          title: 'Analyze',
          description: 'analyze codebase',
          input: { prompt: 'what needs auth?' }
        }
      ]
    }

    const result = PlanSchema.safeParse(plan)
    expect(result.success).toBe(true)
  })

  it('rejects plan without steps', () => {
    const plan = {
      id: 'plan-1',
      goal: 'implement feature',
      description: 'add auth',
      steps: []
    }

    const result = PlanSchema.safeParse(plan)
    expect(result.success).toBe(false)
  })

  it('validates step with optional fields', () => {
    const step = {
      id: 'step-1',
      type: 'code_change' as const,
      title: 'Implement',
      description: 'write code',
      input: { prompt: 'write auth module' },
      retryPolicy: { maxRetries: 2, backoffMs: 500 }
    }

    const result = StepSchema.safeParse(step)
    expect(result.success).toBe(true)
  })

  it('rejects invalid step type', () => {
    const step = {
      id: 'step-1',
      type: 'invalid_type',
      title: 'Implement',
      description: 'write code',
      input: {}
    }

    const result = StepSchema.safeParse(step)
    expect(result.success).toBe(false)
  })

  it('validates tool call', () => {
    const toolCall = {
      id: 'tool-1',
      toolName: 'read_file',
      arguments: { path: '/src/main.ts' },
      description: 'read main file'
    }

    const result = ToolCallSchema.safeParse(toolCall)
    expect(result.success).toBe(true)
  })
})

describe('Execution Types', () => {
  it('initializes execution state correctly', () => {
    const state = initializeExecutionState('run-1', 'plan-1')

    expect(state.runId).toBe('run-1')
    expect(state.planId).toBe('plan-1')
    expect(state.status).toBe('pending')
    expect(state.iterationCount).toBe(0)
    expect(state.currentStepIndex).toBe(0)
    expect(state.tokenUsage.total).toBe(0)
  })

  it('validates execution state schema', () => {
    const state = {
      runId: 'run-1',
      planId: 'plan-1',
      currentStepIndex: 0,
      status: 'running' as const,
      startTime: Date.now(),
      iterationCount: 1,
      tokenUsage: { input: 100, output: 50, total: 150 },
      artifacts: [],
      stepResults: {},
      errors: []
    }

    const result = ExecutionStateSchema.safeParse(state)
    expect(result.success).toBe(true)
  })

  it('creates execution context with correct fields', () => {
    const step = {
      id: 'step-1',
      type: 'analysis' as const,
      title: 'Analyze',
      description: 'analyze',
      input: { prompt: 'test' }
    }

    const context = createExecutionContext(
      'run-1',
      'task-1',
      '/repo',
      step,
      { prev: 'output' },
      [],
      { VAR: 'value' }
    )

    expect(context.runId).toBe('run-1')
    expect(context.taskId).toBe('task-1')
    expect(context.repoPath).toBe('/repo')
    expect(context.previousStepOutputs.prev).toBe('output')
    expect(context.environment.VAR).toBe('value')
  })

  it('validates memory block', () => {
    const memory = {
      stepId: 'step-1',
      key: 'analysis_result',
      value: { findings: 'test' },
      timestamp: Date.now(),
      mutable: true
    }

    const result = MemoryBlockSchema.safeParse(memory)
    expect(result.success).toBe(true)
  })
})

describe('Result Types', () => {
  it('creates log entry with timestamp', () => {
    const log = createLogEntry('info', 'test message', { key: 'value' })

    expect(log.level).toBe('info')
    expect(log.message).toBe('test message')
    expect(log.context).toEqual({ key: 'value' })
    expect(log.timestamp).toBeGreaterThan(0)
  })

  it('creates step result correctly', () => {
    const result = createStepResult('step-1', 'success', 100, { data: 'test' })

    expect(result.stepId).toBe('step-1')
    expect(result.status).toBe('success')
    expect(result.duration).toBe(100)
    expect(result.output).toEqual({ data: 'test' })
    expect(result.retryCount).toBe(0)
  })

  it('validates step result schema', () => {
    const result = {
      stepId: 'step-1',
      status: 'success' as const,
      output: { key: 'value' },
      logs: [],
      duration: 100,
      timestamp: Date.now(),
      retryCount: 0
    }

    const validation = StepResultSchema.safeParse(result)
    expect(validation.success).toBe(true)
  })
})

describe('Artifact Types', () => {
  it('creates artifact with calculated size', () => {
    const artifact = createArtifact('run-1', 'step-1', 'output', 'json', { data: 'test' })

    expect(artifact.runId).toBe('run-1')
    expect(artifact.stepId).toBe('step-1')
    expect(artifact.type).toBe('output')
    expect(artifact.format).toBe('json')
    expect(artifact.size).toBeGreaterThan(0)
    expect(artifact.id).toBeTruthy()
  })

  it('validates artifact schema', () => {
    const artifact = {
      id: 'artifact-1',
      runId: 'run-1',
      stepId: 'step-1',
      type: 'log' as const,
      format: 'text' as const,
      content: 'log content',
      size: 100,
      timestamp: Date.now()
    }

    const result = ArtifactSchema.safeParse(artifact)
    expect(result.success).toBe(true)
  })

  it('validates artifact with metadata', () => {
    const artifact = {
      id: 'artifact-1',
      runId: 'run-1',
      stepId: 'step-1',
      type: 'plan' as const,
      format: 'json' as const,
      content: { plan: 'data' },
      size: 100,
      timestamp: Date.now(),
      metadata: { source: 'planner', version: '1.0' }
    }

    const result = ArtifactSchema.safeParse(artifact)
    expect(result.success).toBe(true)
  })
})

describe('Type Safety', () => {
  it('rejects invalid status values', () => {
    const state = {
      runId: 'run-1',
      planId: 'plan-1',
      currentStepIndex: 0,
      status: 'invalid_status',
      startTime: Date.now(),
      iterationCount: 0,
      tokenUsage: { input: 0, output: 0, total: 0 },
      artifacts: [],
      stepResults: {},
      errors: []
    }

    const result = ExecutionStateSchema.safeParse(state)
    expect(result.success).toBe(false)
  })

  it('rejects negative token counts', () => {
    const state = {
      runId: 'run-1',
      planId: 'plan-1',
      currentStepIndex: 0,
      status: 'running' as const,
      startTime: Date.now(),
      iterationCount: 0,
      tokenUsage: { input: -100, output: 50, total: 150 },
      artifacts: [],
      stepResults: {},
      errors: []
    }

    const result = ExecutionStateSchema.safeParse(state)
    expect(result.success).toBe(false)
  })

  it('rejects invalid log levels', () => {
    const log = {
      level: 'invalid_level',
      message: 'test',
      timestamp: Date.now()
    }

    const result = LogEntrySchema.safeParse(log)
    expect(result.success).toBe(false)
  })
})
