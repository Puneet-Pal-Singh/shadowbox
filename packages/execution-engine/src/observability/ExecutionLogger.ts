/**
 * Execution Logger - Structured logging for execution operations
 * Follows [domain/operation] message pattern per AGENTS.md Section 15
 */

import type { ExecutionEvent } from '../events/index.js'

/**
 * Log level type
 */
type LogLevel = 'info' | 'debug' | 'warn' | 'error'

/**
 * Structured log entry
 */
interface LogEntry {
  level: LogLevel
  domain: string
  operation: string
  message: string
  context?: Record<string, unknown>
  timestamp: number
}

/**
 * Execution logger with structured context
 */
export class ExecutionLogger {
  private logs: LogEntry[] = []

  constructor(private runId: string) {}

  /**
   * Log at info level
   */
  info(domain: string, operation: string, message: string, context?: Record<string, unknown>): void {
    this.log('info', domain, operation, message, context)
  }

  /**
   * Log at debug level
   */
  debug(domain: string, operation: string, message: string, context?: Record<string, unknown>): void {
    this.log('debug', domain, operation, message, context)
  }

  /**
   * Log at warn level
   */
  warn(domain: string, operation: string, message: string, context?: Record<string, unknown>): void {
    this.log('warn', domain, operation, message, context)
  }

  /**
   * Log at error level
   */
  error(domain: string, operation: string, message: string, context?: Record<string, unknown>): void {
    this.log('error', domain, operation, message, context)
  }

  /**
   * Log execution event
   */
  logEvent(event: ExecutionEvent): void {
    const domain = 'events'
    const operation = event.type.replace(/_/g, '_')

    let message = ''
    let context: Record<string, unknown> | undefined

    switch (event.type) {
      case 'execution_started':
        message = `Execution started for plan ${event.planId}`
        context = { planId: event.planId }
        break
      case 'step_started':
        message = `Step started: ${event.stepTitle}`
        context = { stepId: event.stepId }
        break
      case 'tool_called':
        message = `Tool invoked: ${event.toolName}`
        context = { toolName: event.toolName, stepId: event.stepId }
        break
      case 'tool_completed':
        message = `Tool completed: ${event.toolName} (${event.status}) in ${event.duration}ms`
        context = { toolName: event.toolName, status: event.status, duration: event.duration }
        break
      case 'step_completed':
        message = `Step completed: ${event.stepId} (${event.status}) in ${event.duration}ms`
        context = { stepId: event.stepId, status: event.status, duration: event.duration }
        break
      case 'execution_completed':
        message = `Execution completed in ${event.duration}ms`
        context = { duration: event.duration }
        break
      case 'execution_stopped':
        message = `Execution stopped: ${event.reason}`
        context = { reason: event.reason }
        break
      case 'execution_failed':
        message = `Execution failed: ${event.error}`
        context = { error: event.error }
        break
    }

    this.info(domain, operation, message, context)
  }

  /**
   * Get all logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  /**
   * Get logs for specific level
   */
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level)
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = []
  }

  /**
   * Internal log method
   */
  private log(
    level: LogLevel,
    domain: string,
    operation: string,
    message: string,
    context?: Record<string, unknown>
  ): void {
    const logEntry: LogEntry = {
      level,
      domain,
      operation,
      message,
      context,
      timestamp: Date.now()
    }

    this.logs.push(logEntry)

    // Also output to console
    const prefix = `[${domain}/${operation}]`
    const logFn = console[level] || console.log

    if (context) {
      logFn(prefix, message, context)
    } else {
      logFn(prefix, message)
    }
  }
}
