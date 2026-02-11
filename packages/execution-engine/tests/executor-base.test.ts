/**
 * EnvironmentManager Tests
 * Validates abstract base class behavior and template method pattern
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EnvironmentManager } from '../src/executor/EnvironmentManager.js'
import type {
  Executor,
  ExecutionEnvironment,
  ExecutionTask,
  ExecutionResult,
  ExecutionLog,
  EnvironmentConfig
} from '../src/types/executor.js'

/**
 * Mock executor implementation for testing
 */
class MockExecutor extends EnvironmentManager {
  readonly name = 'MockExecutor'
  private shouldFail = false
  private executionDelay = 0

  createEnvironment(config: EnvironmentConfig): Promise<ExecutionEnvironment> {
    return Promise.resolve({
      id: `mock-${config.runId}`,
      type: 'docker',
      createdAt: Date.now()
    })
  }

  protected async _executeImpl(
    env: ExecutionEnvironment,
    task: ExecutionTask
  ): Promise<ExecutionResult> {
    // Simulate execution delay
    if (this.executionDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.executionDelay))
    }

    if (this.shouldFail) {
      throw new Error('Mock execution failed')
    }

    return {
      exitCode: 0,
      stdout: `Executed: ${task.command}`,
      stderr: '',
      duration: this.executionDelay,
      timestamp: Date.now(),
      status: 'success'
    }
  }

  async streamLogs(env: ExecutionEnvironment): Promise<AsyncIterable<ExecutionLog>> {
    const logs: ExecutionLog[] = [
      { timestamp: Date.now(), level: 'info', message: 'Starting execution' },
      { timestamp: Date.now(), level: 'info', message: 'Execution complete' }
    ]

    return {
      async *[Symbol.asyncIterator]() {
        for (const log of logs) {
          yield log
        }
      }
    }
  }

  async destroyEnvironment(env: ExecutionEnvironment): Promise<void> {
    // Mock cleanup
  }

  // Test helpers
  setShouldFail(value: boolean) {
    this.shouldFail = value
  }

  setExecutionDelay(ms: number) {
    this.executionDelay = ms
  }
}

describe('EnvironmentManager', () => {
  let executor: MockExecutor
  let env: ExecutionEnvironment
  let config: EnvironmentConfig

  beforeEach(() => {
    executor = new MockExecutor()
    config = {
      runId: 'test-run-123',
      taskId: 'task-456',
      repoPath: '/home/user/repo'
    }
  })

  describe('Interface Contract', () => {
    it('implements Executor interface', () => {
      expect(executor.name).toBeDefined()
      expect(executor.createEnvironment).toBeDefined()
      expect(executor.executeTask).toBeDefined()
      expect(executor.streamLogs).toBeDefined()
      expect(executor.destroyEnvironment).toBeDefined()
    })

    it('has readonly name property', () => {
      expect(executor.name).toBe('MockExecutor')
      // TypeScript ensures readonly, so this is compile-time verified
    })
  })

  describe('createEnvironment()', () => {
    it('creates execution environment', async () => {
      env = await executor.createEnvironment(config)

      expect(env).toBeDefined()
      expect(env.id).toContain('mock-')
      expect(env.type).toBe('docker')
      expect(env.createdAt).toBeGreaterThan(0)
    })

    it('includes runId in environment id', async () => {
      env = await executor.createEnvironment(config)

      expect(env.id).toContain(config.runId)
    })

    it('sets creation timestamp', async () => {
      const before = Date.now()
      env = await executor.createEnvironment(config)
      const after = Date.now()

      expect(env.createdAt).toBeGreaterThanOrEqual(before)
      expect(env.createdAt).toBeLessThanOrEqual(after)
    })
  })

  describe('executeTask()', () => {
    beforeEach(async () => {
      env = await executor.createEnvironment(config)
    })

    it('executes task successfully', async () => {
      const task: ExecutionTask = {
        id: 'task-1',
        command: 'echo "hello"',
        cwd: '/home/user/repo'
      }

      const result = await executor.executeTask(env, task)

      expect(result.status).toBe('success')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('hello')
    })

    it('includes execution result fields', async () => {
      const task: ExecutionTask = {
        id: 'task-1',
        command: 'test',
        cwd: '/home/user/repo'
      }

      const result = await executor.executeTask(env, task)

      expect(result).toHaveProperty('exitCode')
      expect(result).toHaveProperty('stdout')
      expect(result).toHaveProperty('stderr')
      expect(result).toHaveProperty('duration')
      expect(result).toHaveProperty('timestamp')
      expect(result).toHaveProperty('status')
    })

    it('measures execution duration', async () => {
      executor.setExecutionDelay(100)
      const task: ExecutionTask = {
        id: 'task-1',
        command: 'sleep 0.1',
        cwd: '/home/user/repo'
      }

      const result = await executor.executeTask(env, task)

      expect(result.duration).toBeGreaterThanOrEqual(100)
    })

    it('includes timestamp', async () => {
      const before = Date.now()
      const task: ExecutionTask = {
        id: 'task-1',
        command: 'test',
        cwd: '/home/user/repo'
      }

      const result = await executor.executeTask(env, task)
      const after = Date.now()

      expect(result.timestamp).toBeGreaterThanOrEqual(before)
      expect(result.timestamp).toBeLessThanOrEqual(after)
    })

    it('propagates execution errors', async () => {
      executor.setShouldFail(true)
      const task: ExecutionTask = {
        id: 'task-1',
        command: 'fail',
        cwd: '/home/user/repo'
      }

      await expect(executor.executeTask(env, task)).rejects.toThrow('Mock execution failed')
    })

    it('logs errors with context', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error')
      executor.setShouldFail(true)
      const task: ExecutionTask = {
        id: 'task-1',
        command: 'fail',
        cwd: '/home/user/repo'
      }

      await expect(executor.executeTask(env, task)).rejects.toThrow()

      expect(consoleErrorSpy).toHaveBeenCalled()
      const callArg = consoleErrorSpy.mock.calls[0]?.[0]
      expect(String(callArg)).toContain('[executor/')
      expect(String(callArg)).toContain('Task execution failed')

      consoleErrorSpy.mockRestore()
    })
  })

  describe('streamLogs()', () => {
    beforeEach(async () => {
      env = await executor.createEnvironment(config)
    })

    it('returns async iterable of logs', async () => {
      const logs = await executor.streamLogs(env)

      expect(logs[Symbol.asyncIterator]).toBeDefined()
    })

    it('yields log entries', async () => {
      const logs = await executor.streamLogs(env)
      const logArray: ExecutionLog[] = []

      for await (const log of logs) {
        logArray.push(log)
      }

      expect(logArray.length).toBeGreaterThan(0)
      expect(logArray[0]).toHaveProperty('timestamp')
      expect(logArray[0]).toHaveProperty('level')
      expect(logArray[0]).toHaveProperty('message')
    })

    it('supports multiple consumers', async () => {
      const logs1 = await executor.streamLogs(env)
      const logs2 = await executor.streamLogs(env)

      const array1: ExecutionLog[] = []
      const array2: ExecutionLog[] = []

      for await (const log of logs1) {
        array1.push(log)
      }
      for await (const log of logs2) {
        array2.push(log)
      }

      expect(array1.length).toBeGreaterThan(0)
      expect(array2.length).toBeGreaterThan(0)
    })
  })

  describe('destroyEnvironment()', () => {
    beforeEach(async () => {
      env = await executor.createEnvironment(config)
    })

    it('destroys environment without error', async () => {
      await expect(executor.destroyEnvironment(env)).resolves.toBeUndefined()
    })

    it('completes successfully for valid environment', async () => {
      const result = await executor.destroyEnvironment(env)
      expect(result).toBeUndefined()
    })
  })

  describe('Template Method Pattern', () => {
    beforeEach(async () => {
      env = await executor.createEnvironment(config)
    })

    it('executeTask orchestrates common logic', async () => {
      const task: ExecutionTask = {
        id: 'task-1',
        command: 'test',
        cwd: '/home/user/repo'
      }

      const result = await executor.executeTask(env, task)

      // Verify common template logic was applied
      expect(result.duration).toBeDefined()
      expect(result.duration).toBeGreaterThanOrEqual(0)
      expect(result.timestamp).toBeDefined()
    })

    it('handles errors in protected _executeImpl', async () => {
      executor.setShouldFail(true)
      const task: ExecutionTask = {
        id: 'task-1',
        command: 'test',
        cwd: '/home/user/repo'
      }

      // Error should propagate from _executeImpl through executeTask
      await expect(executor.executeTask(env, task)).rejects.toThrow()
    })
  })

  describe('Lifecycle', () => {
    it('full lifecycle works end-to-end', async () => {
      // Create
      const env = await executor.createEnvironment(config)
      expect(env).toBeDefined()

      // Execute
      const task: ExecutionTask = {
        id: 'task-1',
        command: 'echo "test"',
        cwd: '/home/user/repo'
      }
      const result = await executor.executeTask(env, task)
      expect(result.status).toBe('success')

      // Stream logs
      const logs = await executor.streamLogs(env)
      const logArray: ExecutionLog[] = []
      for await (const log of logs) {
        logArray.push(log)
      }
      expect(logArray.length).toBeGreaterThan(0)

      // Destroy
      await executor.destroyEnvironment(env)
    })

    it('multiple executions in same environment', async () => {
      const env = await executor.createEnvironment(config)

      const task1: ExecutionTask = {
        id: 'task-1',
        command: 'echo "first"',
        cwd: '/home/user/repo'
      }
      const task2: ExecutionTask = {
        id: 'task-2',
        command: 'echo "second"',
        cwd: '/home/user/repo'
      }

      const result1 = await executor.executeTask(env, task1)
      const result2 = await executor.executeTask(env, task2)

      expect(result1.status).toBe('success')
      expect(result2.status).toBe('success')
      expect(result1.stdout).toContain('first')
      expect(result2.stdout).toContain('second')

      await executor.destroyEnvironment(env)
    })
  })
})
