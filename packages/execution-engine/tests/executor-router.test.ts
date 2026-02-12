/**
 * ExecutorRouter Tests
 * Tests routing logic and executor selection
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ExecutorRouter, type ExecutorHint } from '../src/executor/ExecutorRouter/ExecutorRouter.js'
import type { Executor, ExecutionEnvironment, ExecutionResult, ExecutionTask } from '../src/types/executor.js'

/**
 * Mock executor for testing
 */
class MockExecutor implements Executor {
  readonly name = 'mock'

  async createEnvironment() {
    return {
      id: 'mock-env-123',
      type: 'docker' as const,
      createdAt: Date.now(),
      metadata: {}
    }
  }

  async executeTask() {
    return {
      exitCode: 0,
      stdout: 'mock output',
      stderr: '',
      duration: 100,
      timestamp: Date.now(),
      status: 'success' as const
    }
  }

  async streamLogs() {
    return {
      [Symbol.asyncIterator]: async function* () {
        yield { timestamp: Date.now(), level: 'info' as const, message: 'mock log' }
      }
    }
  }

  async destroyEnvironment() {}
}

describe('ExecutorRouter', () => {
  let router: ExecutorRouter
  let mockExecutor: MockExecutor

  beforeEach(() => {
    mockExecutor = new MockExecutor()
    const registry = new Map<ExecutorHint, Executor>([
      ['docker', mockExecutor],
      ['cloud', mockExecutor],
      ['local', mockExecutor]
    ])
    router = new ExecutorRouter(registry)
  })

  describe('selectExecutor', () => {
    it('should respect executor hint when provided', () => {
      const task: ExecutionTask = {
        id: 'task-1',
        command: 'echo hello',
        cwd: '/workspace',
        executorHint: 'cloud'
      }

      const decision = router.selectExecutor(task)

      expect(decision.executorId).toBe('cloud')
      expect(decision.confidence).toBe(1.0)
      expect(decision.reason).toContain('User specified')
    })

    it('should auto-select cloud for GPU tasks', () => {
      const task: ExecutionTask = {
        id: 'task-1',
        command: 'python train.py',
        cwd: '/workspace',
        requiresGPU: true
      }

      const decision = router.selectExecutor(task)

      expect(decision.executorId).toBe('cloud')
      expect(decision.reason).toContain('GPU')
    })

    it('should auto-select cloud for long-running tasks', () => {
      const task: ExecutionTask = {
        id: 'task-1',
        command: 'long-process',
        cwd: '/workspace',
        estimatedDuration: 400000 // 400 seconds
      }

      const decision = router.selectExecutor(task)

      expect(decision.executorId).toBe('cloud')
      expect(decision.reason).toContain('Long-running')
    })

    it('should default to docker when available', () => {
      const task: ExecutionTask = {
        id: 'task-1',
        command: 'npm test',
        cwd: '/workspace'
      }

      const decision = router.selectExecutor(task)

      expect(decision.executorId).toBe('docker')
      expect(decision.confidence).toBeGreaterThan(0.5)
    })

    it('should throw when no executors registered', () => {
      const emptyRouter = new ExecutorRouter(new Map())
      const task: ExecutionTask = {
        id: 'task-1',
        command: 'echo',
        cwd: '/workspace'
      }

      expect(() => emptyRouter.selectExecutor(task)).toThrow()
    })
  })

  describe('getExecutor', () => {
    it('should return executor by ID', () => {
      const executor = router.getExecutor('docker')
      expect(executor).toBeDefined()
      expect(executor.name).toBe('mock')
    })

    it('should throw for unknown executor', () => {
      expect(() => router.getExecutor('unknown' as ExecutorHint)).toThrow()
    })
  })

  describe('listAvailableExecutors', () => {
    it('should return all registered executors', () => {
      const executors = router.listAvailableExecutors()
      expect(executors).toContain('docker')
      expect(executors).toContain('cloud')
      expect(executors).toContain('local')
      expect(executors).toHaveLength(3)
    })
  })

  describe('constructor validation', () => {
    it('should reject empty registry', () => {
      expect(() => new ExecutorRouter(new Map())).toThrow()
    })

    it('should accept single executor', () => {
      const registry = new Map<ExecutorHint, Executor>([['docker', mockExecutor]])
      expect(() => new ExecutorRouter(registry)).not.toThrow()
    })
  })
})
