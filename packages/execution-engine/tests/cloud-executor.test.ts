/**
 * Cloud Sandbox Executor Tests
 * 100% mocked API calls, no real network requests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { CloudSandboxExecutor, type CloudSandboxExecutorConfig } from '../src/executor/CloudSandboxExecutor/CloudSandboxExecutor.js'
import type { EnvironmentConfig, ExecutionTask } from '../src/types/executor.js'

// Mock fetch globally
global.fetch = vi.fn()

describe('CloudSandboxExecutor', () => {
  let executor: CloudSandboxExecutor
  const config: CloudSandboxExecutorConfig = {
    apiUrl: 'https://api.sandbox.example.com',
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
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should create executor with valid config', () => {
      expect(executor.name).toBe('Cloud Sandbox')
    })

    it('should reject missing apiUrl', () => {
      expect(() => {
        new CloudSandboxExecutor({
          ...config,
          apiUrl: ''
        })
      }).toThrow('apiUrl is required')
    })

    it('should reject invalid URL', () => {
      expect(() => {
        new CloudSandboxExecutor({
          ...config,
          apiUrl: 'not-a-url'
        })
      }).toThrow('Invalid apiUrl')
    })

    it('should reject missing apiToken', () => {
      expect(() => {
        new CloudSandboxExecutor({
          ...config,
          apiToken: ''
        })
      }).toThrow('apiToken is required')
    })
  })

  describe('createEnvironment', () => {
    it('should create environment successfully', async () => {
      const mockResponse = {
        sessionId: 'session-789',
        token: 'token-xyz',
        expiresAt: Date.now() + 3600000
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response)

      const env = await executor.createEnvironment(envConfig)

      expect(env.id).toBe('session-789')
      expect(env.type).toBe('cloud')
      expect(env.metadata?.sessionId).toBe('session-789')
      expect(env.metadata?.token).toBe('token-xyz')
    })

    it('should include auth header in request', async () => {
      const mockResponse = {
        sessionId: 'session-789',
        token: 'token-xyz',
        expiresAt: Date.now() + 3600000
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response)

      await executor.createEnvironment(envConfig)

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/session'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token-123',
            'Content-Type': 'application/json'
          })
        })
      )
    })

    it('should handle 401 Unauthorized', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid token'
      } as Response)

      await expect(executor.createEnvironment(envConfig)).rejects.toThrow()
    })

    it('should handle 500 Internal Server Error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Something went wrong'
      } as Response)

      await expect(executor.createEnvironment(envConfig)).rejects.toThrow()
    })

    it('should handle malformed JSON response', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Invalid JSON'))

      await expect(executor.createEnvironment(envConfig)).rejects.toThrow()
    })

    it('should validate session response format strictly', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          sessionId: 'session-789'
          // missing token and expiresAt
        })
      } as Response

      vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

      await expect(executor.createEnvironment(envConfig)).rejects.toThrow()
    })

    it('should retry on transient failure', async () => {
      const mockResponse = {
        sessionId: 'session-789',
        token: 'token-xyz',
        expiresAt: Date.now() + 3600000
      }

      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        } as Response)

      const env = await executor.createEnvironment(envConfig)

      expect(env.id).toBe('session-789')
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('should fail after max retries exceeded', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

      executor = new CloudSandboxExecutor({
        ...config,
        maxRetries: 2
      })

      await expect(executor.createEnvironment(envConfig)).rejects.toThrow('Network error')

      // Verify retry attempts: initial + 2 retries = 3 total
      expect(fetch).toHaveBeenCalledTimes(3)
    })
  })

  describe('executeTask', () => {
    const env = {
      id: 'session-789',
      type: 'cloud' as const,
      createdAt: Date.now(),
      metadata: {
        sessionId: 'session-789',
        token: 'token-xyz',
        expiresAt: Date.now() + 3600000
      }
    }

    it('should execute task successfully', async () => {
      const mockResponse = {
        exitCode: 0,
        stdout: 'All tests passed',
        stderr: '',
        duration: 5000,
        status: 'success' as const
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response)

      const result = await executor.executeTask(env, task)

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('All tests passed')
      expect(result.status).toBe('success')
    })

    it('should handle task failure', async () => {
      const mockResponse = {
        exitCode: 1,
        stdout: '',
        stderr: 'Test failed',
        duration: 3000,
        status: 'error' as const
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response)

      const result = await executor.executeTask(env, task)

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toBe('Test failed')
      expect(result.status).toBe('error')
    })

    it('should handle task timeout', async () => {
      const mockResponse = {
        exitCode: 124,
        stdout: 'Partial output',
        stderr: 'Command timed out',
        duration: 30000,
        status: 'timeout' as const
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response)

      const result = await executor.executeTask(env, task)

      expect(result.status).toBe('timeout')
    })

    it('should reject task with missing sessionId', async () => {
      const invalidEnv = {
        ...env,
        metadata: {} // missing sessionId
      }

      await expect(executor.executeTask(invalidEnv, task)).rejects.toThrow(
        'Session ID not found'
      )
    })

    it('should reject task with path traversal in cwd', async () => {
      const maliciousTask = {
        ...task,
        cwd: '../../../etc/passwd'
      }

      const result = await executor.executeTask(env, maliciousTask)

      expect(result.status).toBe('error')
      expect(result.stderr).toContain('Path traversal not allowed')
    })

    it('should reject task with missing command', async () => {
      const invalidTask = {
        ...task,
        command: ''
      }

      const result = await executor.executeTask(env, invalidTask)

      expect(result.status).toBe('error')
      expect(result.stderr).toContain('Task command is required')
    })

    it('should include sessionId in request body', async () => {
      const mockResponse = {
        exitCode: 0,
        stdout: 'OK',
        stderr: '',
        duration: 1000,
        status: 'success' as const
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response)

      await executor.executeTask(env, task)

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/execute'),
        expect.objectContaining({
          body: expect.stringContaining('session-789')
        })
      )
    })

    it('should use session token for execute request authorization', async () => {
      const mockResponse = {
        exitCode: 0,
        stdout: 'OK',
        stderr: '',
        duration: 1000,
        status: 'success' as const
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response)

      await executor.executeTask(env, task)

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/execute'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer token-xyz'
          })
        })
      )
    })

    it('should handle API error response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: async () => 'Internal error'
      } as Response)

      const result = await executor.executeTask(env, task)

      expect(result.status).toBe('error')
      expect(result.exitCode).toBe(1)
    })

    it('should treat non-implemented execute contract as non-retryable', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 501,
        statusText: 'Not Implemented',
        text: async () =>
          JSON.stringify({
            error: 'Runtime execution is not implemented on this deployment',
            code: 'EXECUTION_NOT_IMPLEMENTED'
          })
      } as Response)

      const result = await executor.executeTask(env, task)

      expect(result.status).toBe('error')
      expect(result.exitCode).toBe(78)
      expect(result.stderr).toContain('not implemented')
      expect(fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('streamLogs', () => {
    const env = {
      id: 'session-789',
      type: 'cloud' as const,
      createdAt: Date.now(),
      metadata: {
        sessionId: 'session-789',
        token: 'token-xyz',
        expiresAt: Date.now() + 3600000
      }
    }

    it('should return async iterable for logs', async () => {
      const iterator = await executor.streamLogs(env)

      expect(iterator).toBeDefined()
      expect(iterator[Symbol.asyncIterator]).toBeDefined()
    })

    it('should reject missing sessionId', async () => {
      const invalidEnv = {
        ...env,
        metadata: {} // missing sessionId
      }

      await expect(executor.streamLogs(invalidEnv)).rejects.toThrow(
        'Session ID not found'
      )
    })

    it('should handle log fetch errors gracefully', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: async () => 'Error'
      } as Response)

      const iterator = await executor.streamLogs(env)
      const logs = []

      for await (const log of iterator) {
        logs.push(log)
        if (logs[logs.length - 1].level === 'error') break // Stop after error log
      }

      expect(logs).toHaveLength(1)
      expect(logs[0].level).toBe('error')
    })

    it('should validate log response schema', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { timestamp: Date.now(), level: 'info', message: 'OK' },
          { timestamp: Date.now(), level: 'invalid' } // missing message, invalid level
        ]
      } as Response)

      const iterator = await executor.streamLogs(env)
      const logs = []

      for await (const log of iterator) {
        logs.push(log)
        if (logs[logs.length - 1].level === 'error') break
      }

      // Should receive an error log about invalid schema
      expect(logs.some(l => l.level === 'error')).toBe(true)
    })
  })

  describe('destroyEnvironment', () => {
    const env = {
      id: 'session-789',
      type: 'cloud' as const,
      createdAt: Date.now(),
      metadata: {
        sessionId: 'session-789',
        token: 'token-xyz',
        expiresAt: Date.now() + 3600000
      }
    }

    it('should destroy environment successfully', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      } as Response)

      await executor.destroyEnvironment(env)

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/session/session-789'),
        expect.objectContaining({
          method: 'DELETE'
        })
      )
    })

    it('should handle missing sessionId gracefully', async () => {
      const invalidEnv = {
        ...env,
        metadata: {} // missing sessionId
      }

      // Should not throw
      await executor.destroyEnvironment(invalidEnv)

      expect(fetch).not.toHaveBeenCalled()
    })

    it('should not throw on API error (best effort)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: async () => 'Error'
      } as Response)

      // Should not throw
      await executor.destroyEnvironment(env)

      expect(fetch).toHaveBeenCalled()
    })

    it('should retry deletion on transient failure', async () => {
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({})
        } as Response)

      await executor.destroyEnvironment(env)

      expect(fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('error handling', () => {
    it('should scrub sensitive data from error messages', async () => {
      const sensitiveToken = 'test_live_secret_abcdef1234567890'
      const errorMessage = `Failed: token=${sensitiveToken}`

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => errorMessage
      } as Response)

      const env = {
        id: 'session-789',
        type: 'cloud' as const,
        createdAt: Date.now(),
        metadata: {
          sessionId: 'session-789',
          token: 'token-xyz',
          expiresAt: Date.now() + 3600000
        }
      }

      const result = await executor.executeTask(env, {
        id: 'step-1',
        command: 'echo test',
        cwd: '/workspace'
      })

      // Token should be redacted in the error output
      if (result.stderr.includes('REDACTED')) {
        expect(result.stderr).toContain('[REDACTED]')
      }
      // Either way, the sensitive token should not appear
      expect(result.stderr).not.toContain(sensitiveToken)
    })

    it('should preserve non-sensitive long identifiers in error messages', async () => {
      const sessionMarker = 'sess_1234567890_abcdef'
      const errorMessage = `Execution failed for ${sessionMarker} at https://api.example.com/v1/executions/1234567890`

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => errorMessage
      } as Response)

      const env = {
        id: 'session-789',
        type: 'cloud' as const,
        createdAt: Date.now(),
        metadata: {
          sessionId: 'session-789',
          token: 'token-xyz',
          expiresAt: Date.now() + 3600000
        }
      }

      const result = await executor.executeTask(env, {
        id: 'step-1',
        command: 'echo test',
        cwd: '/workspace'
      })

      expect(result.stderr).toContain(sessionMarker)
      expect(result.stderr).toContain('https://api.example.com')
    })
  })

  describe('exponential backoff', () => {
    it('should apply exponential backoff on retries', async () => {
      const mockResponse = {
        sessionId: 'session-789',
        token: 'token-xyz',
        expiresAt: Date.now() + 3600000
      }

      const startTime = Date.now()

      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        } as Response)

      executor = new CloudSandboxExecutor({
        ...config,
        maxRetries: 3,
        retryDelayMs: 50
      })

      await executor.createEnvironment(envConfig)

      const elapsed = Date.now() - startTime

      // Should have delays of ~50ms and ~100ms = ~150ms minimum
      expect(elapsed).toBeGreaterThanOrEqual(100)
    })
  })
})
