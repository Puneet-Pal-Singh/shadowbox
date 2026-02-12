/**
 * Executor Interface & Types
 * Defines infra-agnostic execution contract
 * SOLID: Open/Closed (interface ready for Docker, Cloud, future implementations)
 */

import { z } from 'zod'

/**
 * Execution environment configuration
 */
export const EnvironmentConfigSchema = z.object({
  runId: z.string().min(1, 'runId required'),
  taskId: z.string().min(1, 'taskId required'),
  repoPath: z.string().min(1, 'repoPath required'),
  metadata: z.record(z.unknown()).optional()
})

export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>

/**
 * Execution environment (returned after creation)
 * Opaque to caller — implementations handle details
 */
export const ExecutionEnvironmentSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['docker', 'cloud']),
  createdAt: z.number().int().positive(),
  metadata: z.record(z.unknown()).optional()
})

export type ExecutionEnvironment = z.infer<typeof ExecutionEnvironmentSchema>

/**
 * Task to execute within an environment
 */
export const ExecutionTaskSchema = z.object({
  id: z.string().min(1),
  command: z.string().min(1),
  cwd: z.string().min(1),
  timeout: z.number().int().positive().optional(),
  env: z.record(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  executorHint: z.enum(['docker', 'cloud', 'local']).optional(),
  requiresGPU: z.boolean().optional(),
  estimatedDuration: z.number().int().positive().optional()
})

export type ExecutionTask = z.infer<typeof ExecutionTaskSchema>

/**
 * Stream log entry from executor (distinct from execution result logs)
 */
export const ExecutionLogSchema = z.object({
  timestamp: z.number().int().positive(),
  level: z.enum(['info', 'warn', 'error', 'debug']),
  message: z.string(),
  source: z.enum(['stdout', 'stderr']).optional()
})

export type ExecutionLog = z.infer<typeof ExecutionLogSchema>

/**
 * Execution result
 */
export const ExecutionResultSchema = z.object({
  exitCode: z.number().int().nonnegative(),
  stdout: z.string(),
  stderr: z.string(),
  duration: z.number().int().nonnegative(),
  timestamp: z.number().int().positive(),
  status: z.enum(['success', 'error', 'timeout']),
  metadata: z.record(z.unknown()).optional()
})

export type ExecutionResult = z.infer<typeof ExecutionResultSchema>

/**
 * Executor interface
 * SOLID: Open/Closed — implementations extend without modification
 * DIP: Depends on interface, not concrete implementations
 *
 * Responsibilities:
 * - Lifecycle: create, execute, stream logs, destroy
 * - Single Responsibility: Only execution, no routing/cost/policy
 */
export interface Executor {
  /**
   * Human-readable name (e.g., "Docker Local", "Cloudflare Sandbox")
   */
  readonly name: string

  /**
   * Create execution environment
   * @throws If environment creation fails
   */
  createEnvironment(config: EnvironmentConfig): Promise<ExecutionEnvironment>

  /**
   * Execute task within environment
   * @throws If execution fails
   */
  executeTask(env: ExecutionEnvironment, task: ExecutionTask): Promise<ExecutionResult>

  /**
   * Stream logs from environment
   * Yields logs asynchronously until environment destroyed
   */
  streamLogs(env: ExecutionEnvironment): Promise<AsyncIterable<ExecutionLog>>

  /**
   * Destroy environment and cleanup resources
   */
  destroyEnvironment(env: ExecutionEnvironment): Promise<void>
}
