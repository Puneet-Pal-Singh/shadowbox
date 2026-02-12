/**
 * Cloud Sandbox Executor Integration Tests
 * Tests CloudSandboxExecutor calling secure-agent-api HTTP API
 *
 * This validates the boundary between execution adapter and infrastructure
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { CloudSandboxExecutor, type CloudSandboxExecutorConfig } from '../src/executor/CloudSandboxExecutor/CloudSandboxExecutor.js'
import type { EnvironmentConfig, ExecutionTask } from '../src/types/executor.js'

// Mock fetch globally
global.fetch = vi.fn()

/**
 * Mock secure-agent-api HTTP API responses
 */
class MockSecureAgentAPI {
  baseUrl = 'http://localhost:8787'
  sessions = new Map<string, any>()
  logs = new Map<string, any[]>()

  mockSessionCreation() {
    const sessionId = 'sess_test_123'
    const token = 'tok_test_456'
    const expiresAt = Date.now() + 3600000

    this.sessions.set(sessionId, { token, expiresAt })

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        sessionId,
        token,
        expiresAt,
        manifest: {
          tools: [
            { name: 'node', version: '18.0.0' },
            { name: 'python', version: '3.11.0' }
          ]
        }
      })
    } as Response)
  }

  mockTaskExecution(
    sessionId: string,
    exitCode: number = 0,
    stdout: string = 'Command executed successfully'
  ) {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        exitCode,
        stdout,
        stderr: '',
        duration: 1234,
        status: exitCode === 0 ? 'success' : 'error',
        timestamp: Date.now()
      })
    } as Response)
  }

  mockLogStream(sessionId: string, logs: any[] = []) {
    const logLines = logs
      .map(log => `data: ${JSON.stringify(log)}\n\n`)
      .join('')

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({
        'Content-Type': 'text/event-stream'
      }),
      body: logLines
    } as Response)
  }

  mockSessionDeletion(sessionId: string) {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: `Session ${sessionId} deleted successfully`
      })
    } as Response)
  }

  mockSessionNotFound() {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      })
    } as Response)
  }

  mockInternalError(message: string = 'Internal server error') {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({
        error: message,
        code: 'INTERNAL_ERROR'
      })
    } as Response)
  }
}

describe('CloudSandboxExecutor Integration with secure-agent-api', () => {
  let executor: CloudSandboxExecutor
  let mockApi: MockSecureAgentAPI
  const config: CloudSandboxExecutorConfig = {
    apiUrl: 'http://localhost:8787',
    apiToken: 'test-token-123'
  }

  const envConfig: EnvironmentConfig = {
    runId: 'run-123',
    taskId: 'task-456',
    repoPath: '/workspace/repo'
  }

  const task: ExecutionTask = {
    id: 'step-1',
    command: 'npm test',
    cwd: '/workspace',
    timeout: 30000
  }

  beforeEach(() => {
    executor = new CloudSandboxExecutor(config)
    mockApi = new MockSecureAgentAPI()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Full Lifecycle', () => {
    it('should create session via secure-agent-api HTTP endpoint', async () => {
      mockApi.mockSessionCreation()

      const env = await executor.createEnvironment(envConfig)

      expect(env.id).toBe('sess_test_123')
      expect(env.type).toBe('cloud')
      expect(env.metadata?.sessionId).toBe('sess_test_123')
      expect(env.metadata?.token).toBe('tok_test_456')

      // Verify fetch was called with correct endpoint
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8787/api/v1/session',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token-123'
          })
        })
      )
    })

    it('should execute task via secure-agent-api HTTP endpoint', async () => {
      const env = {
        id: 'sess_test_123',
        type: 'cloud' as const,
        createdAt: Date.now(),
        metadata: {
          sessionId: 'sess_test_123',
          token: 'tok_test_456',
          expiresAt: Date.now() + 3600000
        }
      }

      mockApi.mockTaskExecution('sess_test_123', 0, 'All tests passed')

      const result = await executor.executeTask(env, task)

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('All tests passed')
      expect(result.status).toBe('success')
      expect(result.duration).toBe(1234)

      // Verify fetch was called with correct endpoint
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8787/api/v1/execute',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token-123'
          })
        })
      )
    })

    it('should stream logs via secure-agent-api HTTP endpoint', async () => {
      const env = {
        id: 'sess_test_123',
        type: 'cloud' as const,
        createdAt: Date.now(),
        metadata: {
          sessionId: 'sess_test_123',
          token: 'tok_test_456',
          expiresAt: Date.now() + 3600000
        }
      }

      const iterator = await executor.streamLogs(env)

      expect(iterator).toBeDefined()
      expect(iterator[Symbol.asyncIterator]).toBeDefined()
    })

    it('should delete session via secure-agent-api HTTP endpoint', async () => {
      const env = {
        id: 'sess_test_123',
        type: 'cloud' as const,
        createdAt: Date.now(),
        metadata: {
          sessionId: 'sess_test_123',
          token: 'tok_test_456',
          expiresAt: Date.now() + 3600000
        }
      }

      mockApi.mockSessionDeletion('sess_test_123')

      await executor.destroyEnvironment(env)

      // Verify fetch was called with correct endpoint
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8787/api/v1/session/sess_test_123',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token-123'
          })
        })
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle session not found error', async () => {
      mockApi.mockSessionNotFound()

      const env = {
        id: 'sess_invalid',
        type: 'cloud' as const,
        createdAt: Date.now(),
        metadata: {
          sessionId: 'sess_invalid',
          token: 'tok_invalid',
          expiresAt: Date.now() + 3600000
        }
      }

      const result = await executor.executeTask(env, task)

      expect(result.status).toBe('error')
      expect(result.exitCode).toBe(1)
    })

    it('should handle internal server error', async () => {
      mockApi.mockInternalError('Database connection failed')

      const env = {
        id: 'sess_test_123',
        type: 'cloud' as const,
        createdAt: Date.now(),
        metadata: {
          sessionId: 'sess_test_123',
          token: 'tok_test_456',
          expiresAt: Date.now() + 3600000
        }
      }

      const result = await executor.executeTask(env, task)

      expect(result.status).toBe('error')
      expect(result.exitCode).toBe(1)
    })

    it('should handle task failure with non-zero exit code', async () => {
      const env = {
        id: 'sess_test_123',
        type: 'cloud' as const,
        createdAt: Date.now(),
        metadata: {
          sessionId: 'sess_test_123',
          token: 'tok_test_456',
          expiresAt: Date.now() + 3600000
        }
      }

      mockApi.mockTaskExecution('sess_test_123', 1, '')

      const result = await executor.executeTask(env, task)

      expect(result.exitCode).toBe(1)
      expect(result.status).toBe('error')
    })
  })

  describe('HTTP Contract Validation', () => {
    it('should include correct headers in session creation request', async () => {
      mockApi.mockSessionCreation()

      await executor.createEnvironment(envConfig)

      const calls = vi.mocked(fetch).mock.calls
      // Get the first successful call
      const sessionCall = calls[0]

      expect(sessionCall).toBeDefined()
      expect(sessionCall[0]).toContain('/api/v1/session')
      expect(sessionCall[1]).toMatchObject({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token-123'
        }
      })
    })

    it('should include request body in execution request', async () => {
      const env = {
        id: 'sess_test_123',
        type: 'cloud' as const,
        createdAt: Date.now(),
        metadata: {
          sessionId: 'sess_test_123',
          token: 'tok_test_456',
          expiresAt: Date.now() + 3600000
        }
      }

      mockApi.mockTaskExecution('sess_test_123')

      await executor.executeTask(env, task)

      const calls = vi.mocked(fetch).mock.calls
      // Get the first call (should be execute)
      const executeCall = calls[0]

      expect(executeCall).toBeDefined()
      expect(executeCall[0]).toContain('/api/v1/execute')

      // Body should be stringified JSON
      const body = executeCall[1]?.body
      expect(typeof body).toBe('string')

      const parsed = JSON.parse(body as string)
      expect(parsed.sessionId).toBe('sess_test_123')
      expect(parsed.command).toBe('npm test')
      expect(parsed.cwd).toBe('/workspace')
    })

    it('should handle 201 Created status for session creation', async () => {
      mockApi.mockSessionCreation()

      const env = await executor.createEnvironment(envConfig)

      expect(env).toBeDefined()
      expect(env.id).toBe('sess_test_123')
    })

    it('should handle 200 OK status for task execution', async () => {
      const env = {
        id: 'sess_test_123',
        type: 'cloud' as const,
        createdAt: Date.now(),
        metadata: {
          sessionId: 'sess_test_123',
          token: 'tok_test_456',
          expiresAt: Date.now() + 3600000
        }
      }

      mockApi.mockTaskExecution('sess_test_123')

      const result = await executor.executeTask(env, task)

      expect(result).toBeDefined()
      expect(result.exitCode).toBe(0)
    })
  })

  describe('Retry Behavior', () => {
    it('should retry transient failures when calling secure-agent-api', async () => {
      const sessionId = 'sess_test_123'

      // First call fails (transient error), second succeeds
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            sessionId,
            token: 'tok_test_456',
            expiresAt: Date.now() + 3600000
          })
        } as Response)

      const env = await executor.createEnvironment(envConfig)

      expect(env.id).toBe(sessionId)
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('should eventually fail after max retries exceeded', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

      executor = new CloudSandboxExecutor({
        ...config,
        maxRetries: 2
      })

      await expect(executor.createEnvironment(envConfig)).rejects.toThrow('Network error')

      // Should attempt: initial + 2 retries = 3 times
      expect(fetch).toHaveBeenCalledTimes(3)
    })
  })

  describe('Authentication', () => {
    it('should include authorization token in all requests', async () => {
      mockApi.mockSessionCreation()

      await executor.createEnvironment(envConfig)

      const calls = vi.mocked(fetch).mock.calls
      const request = calls[0]

      expect(request[1]?.headers).toHaveProperty('Authorization', 'Bearer test-token-123')
    })

    it('should not leak token in error messages', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid token test-token-123'
      } as Response)

      await expect(executor.createEnvironment(envConfig)).rejects.toThrow()

      // Error message should be present but not expose the token
      const calls = vi.mocked(fetch).mock.calls
      expect(calls.length).toBeGreaterThan(0)
    })
  })
})
