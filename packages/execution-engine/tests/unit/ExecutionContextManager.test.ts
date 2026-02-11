/**
 * ExecutionContextManager unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ExecutionContextManager } from '../../src/core/ExecutionContextManager'
import type { Plan, StepResult } from '../../src/types'
import { createStepResult, createLogEntry } from '../../src/types'

describe('ExecutionContextManager', () => {
  let manager: ExecutionContextManager
  let testPlan: Plan

  beforeEach(() => {
    testPlan = {
      id: 'plan-1',
      goal: 'test goal',
      description: 'test',
      steps: [
        {
          id: 'step-1',
          type: 'analysis',
          title: 'Analyze',
          description: 'analyze',
          input: { prompt: 'analyze codebase' }
        },
        {
          id: 'step-2',
          type: 'code_change',
          title: 'Implement',
          description: 'implement',
          input: { prompt: 'implement feature' }
        }
      ]
    }

    manager = new ExecutionContextManager(
      testPlan,
      '/repo',
      'run-1',
      'task-1',
      { NODE_ENV: 'test' }
    )
  })

  describe('Initialization', () => {
    it('initializes with first step', () => {
      const context = manager.initialize()

      expect(context.runId).toBe('run-1')
      expect(context.taskId).toBe('task-1')
      expect(context.repoPath).toBe('/repo')
      expect(context.currentStep.id).toBe('step-1')
      expect(context.environment.NODE_ENV).toBe('test')
    })

    it('throws if plan has no steps', () => {
      const emptyPlan: Plan = {
        id: 'empty',
        goal: 'test',
        description: 'test',
        steps: []
      }

      expect(() => {
        new ExecutionContextManager(emptyPlan, '/repo', 'run-1', 'task-1')
      }).toThrow('Plan must contain at least one step')
    })

    it('initializes with empty memory and outputs', () => {
      manager.initialize()

      expect(manager.getAllMemory()).toHaveLength(0)
      expect(manager.getPreviousStepOutputs()).toEqual({})
    })
  })

  describe('Memory Management', () => {
    beforeEach(() => {
      manager.initialize()
    })

    it('adds memory block', () => {
      manager.addMemory('step-1', 'analysis_result', { findings: 'test' })

      const retrieved = manager.getMemory('analysis_result')
      expect(retrieved).toEqual({ findings: 'test' })
    })

    it('retrieves memory by key', () => {
      manager.addMemory('step-1', 'key1', 'value1')
      manager.addMemory('step-1', 'key2', 'value2')

      expect(manager.getMemory('key1')).toBe('value1')
      expect(manager.getMemory('key2')).toBe('value2')
    })

    it('gets all memory blocks', () => {
      manager.addMemory('step-1', 'key1', 'value1')
      manager.addMemory('step-1', 'key2', { complex: 'object' })

      const allMemory = manager.getAllMemory()
      expect(allMemory).toHaveLength(2)
    })

    it('stores memory in previous step outputs', () => {
      manager.addMemory('step-1', 'mykey', 'myvalue')

      const outputs = manager.getPreviousStepOutputs()
      expect(outputs.memory_mykey).toBe('myvalue')
    })

    it('clears all memory', () => {
      manager.addMemory('step-1', 'key1', 'value1')
      manager.addMemory('step-1', 'key2', 'value2')

      manager.clearMemory()

      expect(manager.getAllMemory()).toHaveLength(0)
      expect(manager.getMemory('key1')).toBeUndefined()
    })

    it('marks memory as mutable or immutable', () => {
      manager.addMemory('step-1', 'immutable_key', 'value', false)
      manager.addMemory('step-1', 'mutable_key', 'value', true)

      const allMemory = manager.getAllMemory()
      const immutable = allMemory.find(m => m.key === 'immutable_key')
      const mutable = allMemory.find(m => m.key === 'mutable_key')

      expect(immutable?.mutable).toBe(false)
      expect(mutable?.mutable).toBe(true)
    })
  })

  describe('Step Results', () => {
    beforeEach(() => {
      manager.initialize()
    })

    it('updates context from step result', () => {
      const result = createStepResult(
        'step-1',
        'success',
        100,
        { analysis: 'complete' },
        []
      )

      manager.updateFromStepResult('step-1', result)

      expect(manager.getStepOutput('step-1')).toEqual({ analysis: 'complete' })
    })

    it('retrieves step output by step ID', () => {
      const result = createStepResult('step-1', 'success', 100, { data: 'test' })
      manager.updateFromStepResult('step-1', result)

      expect(manager.getStepOutput('step-1')).toEqual({ data: 'test' })
    })

    it('returns undefined for unknown step output', () => {
      expect(manager.getStepOutput('unknown-step')).toBeUndefined()
    })

    it('accumulates multiple step outputs', () => {
      const result1 = createStepResult('step-1', 'success', 100, { output1: 'data1' })
      const result2 = createStepResult('step-2', 'success', 100, { output2: 'data2' })

      manager.updateFromStepResult('step-1', result1)
      manager.updateFromStepResult('step-2', result2)

      expect(manager.getStepOutput('step-1')).toEqual({ output1: 'data1' })
      expect(manager.getStepOutput('step-2')).toEqual({ output2: 'data2' })
    })
  })

  describe('Context for Steps', () => {
    beforeEach(() => {
      manager.initialize()
    })

    it('provides immutable context for next step', () => {
      const step2 = testPlan.steps[1]
      const context = manager.getContextForStep(step2)

      expect(context.currentStep.id).toBe('step-2')
      expect(context.runId).toBe('run-1')
      expect(context.repoPath).toBe('/repo')
    })

    it('includes previous step outputs in context', () => {
      const result = createStepResult('step-1', 'success', 100, { prev: 'output' })
      manager.updateFromStepResult('step-1', result)

      const step2 = testPlan.steps[1]
      const context = manager.getContextForStep(step2)

      expect(context.previousStepOutputs.prev).toBe('output')
    })

    it('includes memory blocks in context', () => {
      manager.addMemory('step-1', 'shared_key', 'shared_value')

      const step2 = testPlan.steps[1]
      const context = manager.getContextForStep(step2)

      expect(context.memory).toHaveLength(1)
      expect(context.memory[0].key).toBe('shared_key')
    })

    it('preserves environment variables in context', () => {
      const step2 = testPlan.steps[1]
      const context = manager.getContextForStep(step2)

      expect(context.environment.NODE_ENV).toBe('test')
    })
  })

  describe('Edge Cases', () => {
    beforeEach(() => {
      manager.initialize()
    })

    it('handles null output values', () => {
      const result = createStepResult('step-1', 'success', 0, null)
      manager.updateFromStepResult('step-1', result)

      // Should not crash
      expect(manager.getStepOutput('step-1')).toBeNull()
    })

    it('handles undefined output values', () => {
      const result = createStepResult('step-1', 'success', 0)
      manager.updateFromStepResult('step-1', result)

      // Should not crash
      expect(manager.getStepOutput('step-1')).toBeUndefined()
    })

    it('handles complex nested memory values', () => {
      const complexValue = {
        nested: {
          deep: {
            array: [1, 2, 3],
            obj: { key: 'value' }
          }
        }
      }

      manager.addMemory('step-1', 'complex', complexValue)

      expect(manager.getMemory('complex')).toEqual(complexValue)
    })

    it('tracks memory timestamps', () => {
      const before = Date.now()
      manager.addMemory('step-1', 'timed', 'value')
      const after = Date.now()

      const memory = manager.getAllMemory()[0]
      expect(memory.timestamp).toBeGreaterThanOrEqual(before)
      expect(memory.timestamp).toBeLessThanOrEqual(after)
    })
  })
})
