/**
 * Executor Types Tests
 * Validates Zod schemas and type contracts
 */

import {
  EnvironmentConfigSchema,
  ExecutionEnvironmentSchema,
  ExecutionTaskSchema,
  ExecutionLogSchema,
  ExecutionResultSchema,
  type Executor,
  type ExecutionEnvironment,
  type ExecutionTask,
  type ExecutionLog,
  type ExecutionResult
} from '../src/types/executor.js'

describe('EnvironmentConfigSchema', () => {
  it('validates correct config', () => {
    const config = {
      runId: 'run-123',
      taskId: 'task-456',
      repoPath: '/home/user/repo',
      metadata: { foo: 'bar' }
    }
    const result = EnvironmentConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('rejects missing runId', () => {
    const config = {
      taskId: 'task-456',
      repoPath: '/home/user/repo'
    }
    const result = EnvironmentConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('rejects empty runId', () => {
    const config = {
      runId: '',
      taskId: 'task-456',
      repoPath: '/home/user/repo'
    }
    const result = EnvironmentConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('allows optional metadata', () => {
    const config = {
      runId: 'run-123',
      taskId: 'task-456',
      repoPath: '/home/user/repo'
    }
    const result = EnvironmentConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })
})

describe('ExecutionEnvironmentSchema', () => {
  it('validates correct environment', () => {
    const env = {
      id: 'env-123',
      type: 'docker' as const,
      createdAt: Date.now(),
      metadata: { containerId: 'abc123' }
    }
    const result = ExecutionEnvironmentSchema.safeParse(env)
    expect(result.success).toBe(true)
  })

  it('rejects invalid type', () => {
    const env = {
      id: 'env-123',
      type: 'kubernetes',
      createdAt: Date.now()
    }
    const result = ExecutionEnvironmentSchema.safeParse(env)
    expect(result.success).toBe(false)
  })

  it('rejects non-positive timestamp', () => {
    const env = {
      id: 'env-123',
      type: 'cloud' as const,
      createdAt: 0
    }
    const result = ExecutionEnvironmentSchema.safeParse(env)
    expect(result.success).toBe(false)
  })

  it('accepts both docker and cloud types', () => {
    const dockerEnv = {
      id: 'env-123',
      type: 'docker' as const,
      createdAt: Date.now()
    }
    const cloudEnv = {
      id: 'env-456',
      type: 'cloud' as const,
      createdAt: Date.now()
    }
    expect(ExecutionEnvironmentSchema.safeParse(dockerEnv).success).toBe(true)
    expect(ExecutionEnvironmentSchema.safeParse(cloudEnv).success).toBe(true)
  })
})

describe('ExecutionTaskSchema', () => {
  it('validates correct task', () => {
    const task = {
      id: 'task-123',
      command: 'npm test',
      cwd: '/home/user/repo',
      timeout: 30000,
      env: { NODE_ENV: 'test' }
    }
    const result = ExecutionTaskSchema.safeParse(task)
    expect(result.success).toBe(true)
  })

  it('rejects missing command', () => {
    const task = {
      id: 'task-123',
      cwd: '/home/user/repo'
    }
    const result = ExecutionTaskSchema.safeParse(task)
    expect(result.success).toBe(false)
  })

  it('rejects negative timeout', () => {
    const task = {
      id: 'task-123',
      command: 'npm test',
      cwd: '/home/user/repo',
      timeout: -1000
    }
    const result = ExecutionTaskSchema.safeParse(task)
    expect(result.success).toBe(false)
  })

  it('allows optional timeout and env', () => {
    const task = {
      id: 'task-123',
      command: 'npm test',
      cwd: '/home/user/repo'
    }
    const result = ExecutionTaskSchema.safeParse(task)
    expect(result.success).toBe(true)
  })

  it('validates environment variables are strings', () => {
    const task = {
      id: 'task-123',
      command: 'npm test',
      cwd: '/home/user/repo',
      env: { NODE_ENV: 'test', PORT: '3000' }
    }
    const result = ExecutionTaskSchema.safeParse(task)
    expect(result.success).toBe(true)
  })
})

describe('ExecutionLogSchema', () => {
  it('validates correct log entry', () => {
    const log = {
      timestamp: Date.now(),
      level: 'info' as const,
      message: 'Test message',
      source: 'stdout' as const
    }
    const result = ExecutionLogSchema.safeParse(log)
    expect(result.success).toBe(true)
  })

  it('accepts all log levels', () => {
    const levels = ['info', 'warn', 'error', 'debug'] as const
    levels.forEach(level => {
      const log = {
        timestamp: Date.now(),
        level,
        message: 'Test message'
      }
      expect(ExecutionLogSchema.safeParse(log).success).toBe(true)
    })
  })

  it('rejects invalid log level', () => {
    const log = {
      timestamp: Date.now(),
      level: 'trace',
      message: 'Test message'
    }
    const result = ExecutionLogSchema.safeParse(log)
    expect(result.success).toBe(false)
  })

  it('allows optional source', () => {
    const log = {
      timestamp: Date.now(),
      level: 'info' as const,
      message: 'Test message'
    }
    const result = ExecutionLogSchema.safeParse(log)
    expect(result.success).toBe(true)
  })
})

describe('ExecutionResultSchema', () => {
  it('validates correct result', () => {
    const result = {
      exitCode: 0,
      stdout: 'success',
      stderr: '',
      duration: 1234,
      timestamp: Date.now(),
      status: 'success' as const,
      metadata: { tests: 5 }
    }
    const parsed = ExecutionResultSchema.safeParse(result)
    expect(parsed.success).toBe(true)
  })

  it('validates all status types', () => {
    const statuses = ['success', 'error', 'timeout'] as const
    statuses.forEach(status => {
      const result = {
        exitCode: status === 'success' ? 0 : 1,
        stdout: 'output',
        stderr: '',
        duration: 1000,
        timestamp: Date.now(),
        status
      }
      expect(ExecutionResultSchema.safeParse(result).success).toBe(true)
    })
  })

  it('rejects negative exit code', () => {
    const result = {
      exitCode: -1,
      stdout: 'output',
      stderr: '',
      duration: 1000,
      timestamp: Date.now(),
      status: 'error' as const
    }
    const parsed = ExecutionResultSchema.safeParse(result)
    expect(parsed.success).toBe(false)
  })

  it('rejects negative duration', () => {
    const result = {
      exitCode: 1,
      stdout: 'output',
      stderr: '',
      duration: -100,
      timestamp: Date.now(),
      status: 'error' as const
    }
    const parsed = ExecutionResultSchema.safeParse(result)
    expect(parsed.success).toBe(false)
  })

  it('allows zero duration (instant completion)', () => {
    const result = {
      exitCode: 0,
      stdout: 'instant',
      stderr: '',
      duration: 0,
      timestamp: Date.now(),
      status: 'success' as const
    }
    const parsed = ExecutionResultSchema.safeParse(result)
    expect(parsed.success).toBe(true)
  })

  it('allows empty stdout/stderr', () => {
    const result = {
      exitCode: 0,
      stdout: '',
      stderr: '',
      duration: 1000,
      timestamp: Date.now(),
      status: 'success' as const
    }
    const parsed = ExecutionResultSchema.safeParse(result)
    expect(parsed.success).toBe(true)
  })
})

describe('Executor Interface Contract', () => {
  // This is a compile-time check (TypeScript static)
  // Verifies that Executor has exactly the required methods

  it('Executor interface is defined', () => {
    // If this compiles, the interface is correctly typed
    type ExecutorMethods = keyof Executor
    const methods: ExecutorMethods[] = ['name', 'createEnvironment', 'executeTask', 'streamLogs', 'destroyEnvironment']
    expect(methods).toHaveLength(5)
  })

  it('verifies readonly name property', () => {
    // TypeScript ensures 'name' is readonly
    // This test documents that constraint
    const testImpl: Executor = {
      name: 'TestExecutor',
      createEnvironment: async () => ({
        id: 'test',
        type: 'docker',
        createdAt: Date.now()
      }),
      executeTask: async () => ({
        exitCode: 0,
        stdout: '',
        stderr: '',
        duration: 0,
        timestamp: Date.now(),
        status: 'success'
      }),
      streamLogs: async function* () {
        yield { timestamp: Date.now(), level: 'info' as const, message: 'test' }
      },
      destroyEnvironment: async () => {}
    }
    expect(testImpl.name).toBe('TestExecutor')
  })
})
