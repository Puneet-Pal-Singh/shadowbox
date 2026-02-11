/**
 * Docker Executor - Local Docker implementation
 * Spawns containers, executes tasks, captures output
 *
 * SOLID:
 * - SRP: Only Docker lifecycle, not scheduling/routing/costing
 * - LSP: Fully substitutable for Executor interface
 */

import { execSync, spawn } from 'child_process'
import type {
  EnvironmentConfig,
  ExecutionEnvironment,
  ExecutionTask,
  ExecutionResult,
  ExecutionLog
} from '../../types/executor.js'
import { EnvironmentManager } from '../EnvironmentManager.js'

/**
 * Configuration for DockerExecutor
 */
export interface DockerExecutorConfig {
  /**
   * Docker image to use (e.g., 'node:18-alpine')
   */
  image: string

  /**
   * Base name for containers (default: 'shadowbox')
   */
  baseContainerName?: string

  /**
   * Network mode (default: 'bridge')
   */
  network?: string
}

/**
 * Local Docker executor implementation
 * Creates Docker containers for isolated task execution
 */
export class DockerExecutor extends EnvironmentManager {
  readonly name = 'Docker'
  private image: string
  private baseContainerName: string
  private network: string

  constructor(config: DockerExecutorConfig) {
    super()
    this.image = config.image
    this.baseContainerName = config.baseContainerName ?? 'shadowbox'
    this.network = config.network ?? 'bridge'
  }

  async createEnvironment(config: EnvironmentConfig): Promise<ExecutionEnvironment> {
    const containerName = this.generateContainerName(config.runId)

    try {
      // Validate Docker is available
      this.validateDocker()

      // Validate container name safety
      this.validateContainerName(containerName)

      // Pull image if needed (best effort)
      this.pullImage()

      // Create and start container
      const containerId = this.startContainer(containerName)

      console.log(`[executor/docker] Created container: ${containerName} (${containerId})`)

      return {
        id: containerId,
        type: 'docker',
        createdAt: Date.now(),
        metadata: {
          containerName,
          image: this.image
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[executor/docker] Failed to create environment: ${msg}`)
      throw error
    }
  }

  protected async _executeImpl(
    env: ExecutionEnvironment,
    task: ExecutionTask
  ): Promise<ExecutionResult> {
    const containerName = env.metadata?.containerName as string
    if (!containerName) {
      throw new Error('Container name not found in environment metadata')
    }

    try {
      // Validate task inputs
      this.validateTask(task)

      // Execute command in container
      const output = this.executeInContainer(containerName, task)

      return {
        exitCode: 0,
        stdout: output.stdout,
        stderr: output.stderr,
        duration: output.duration,
        timestamp: Date.now(),
        status: 'success'
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return {
        exitCode: 1,
        stdout: '',
        stderr: msg,
        duration: 0,
        timestamp: Date.now(),
        status: 'error'
      }
    }
  }

  async streamLogs(env: ExecutionEnvironment): Promise<AsyncIterable<ExecutionLog>> {
    const containerName = env.metadata?.containerName as string
    if (!containerName) {
      throw new Error('Container name not found in environment metadata')
    }

    return {
      async *[Symbol.asyncIterator]() {
        // Simple implementation: yield static logs
        // In real implementation, would stream from `docker logs -f`
        yield {
          timestamp: Date.now(),
          level: 'info',
          message: `Monitoring logs for container: ${containerName}`
        }
      }
    }
  }

  async destroyEnvironment(env: ExecutionEnvironment): Promise<void> {
    const containerName = env.metadata?.containerName as string
    if (!containerName) {
      console.warn('[executor/docker] Container name not found in metadata')
      return
    }

    try {
      // Stop container
      execSync(`docker stop ${containerName}`, { stdio: 'pipe' })

      // Remove container
      execSync(`docker rm ${containerName}`, { stdio: 'pipe' })

      console.log(`[executor/docker] Destroyed container: ${containerName}`)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.warn(`[executor/docker] Failed to destroy container: ${msg}`)
      // Don't throw — best effort cleanup
    }
  }

  /**
   * Validate Docker is installed and available
   */
  private validateDocker(): void {
    try {
      execSync('docker --version', { stdio: 'pipe' })
    } catch {
      throw new Error('Docker is not available. Ensure Docker is installed and running.')
    }
  }

  /**
   * Generate safe container name from runId
   * Validates name doesn't contain path traversal or dangerous chars
   */
  private generateContainerName(runId: string): string {
    // Sanitize: only alphanumeric, dash, underscore
    const sanitized = runId.replace(/[^a-zA-Z0-9_-]/g, '')

    if (!sanitized) {
      throw new Error(`Invalid runId for container name: ${runId}`)
    }

    return `${this.baseContainerName}-${sanitized}`
  }

  /**
   * Validate container name safety
   */
  private validateContainerName(name: string): void {
    if (name.includes('..') || name.includes('/')) {
      throw new Error(`Unsafe container name: ${name}`)
    }

    if (name.length > 63) {
      throw new Error('Container name too long (max 63 characters)')
    }
  }

  /**
   * Validate task inputs for safety
   */
  private validateTask(task: ExecutionTask): void {
    if (!task.command) {
      throw new Error('Task command is required')
    }

    if (task.command.includes(';') || task.command.includes('|')) {
      throw new Error('Command chaining not allowed')
    }

    // Validate cwd doesn't escape
    if (task.cwd.includes('..')) {
      throw new Error('Path traversal not allowed')
    }
  }

  /**
   * Pull Docker image (best effort)
   */
  private pullImage(): void {
    try {
      execSync(`docker pull ${this.image}`, { stdio: 'pipe', timeout: 60000 })
    } catch {
      // Ignore — image may already exist locally
      console.debug(`[executor/docker] Could not pull image: ${this.image}`)
    }
  }

  /**
   * Start Docker container
   */
  private startContainer(containerName: string): string {
    try {
      const containerId = execSync(
        `docker run -d --name ${containerName} --network ${this.network} ${this.image} sleep infinity`,
        { stdio: 'pipe', encoding: 'utf-8' }
      ).trim()

      return containerId
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to start container: ${msg}`)
    }
  }

  /**
   * Execute command in container
   */
  private executeInContainer(
    containerName: string,
    task: ExecutionTask
  ): { stdout: string; stderr: string; duration: number } {
    const startTime = Date.now()

    try {
      const stdout = execSync(`docker exec -w ${task.cwd} ${containerName} ${task.command}`, {
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: task.timeout ?? 30000
      }).trim()

      const duration = Date.now() - startTime

      return { stdout, stderr: '', duration }
    } catch (error) {
      const duration = Date.now() - startTime
      const stderr = error instanceof Error ? error.message : String(error)

      return { stdout: '', stderr, duration }
    }
  }
}
