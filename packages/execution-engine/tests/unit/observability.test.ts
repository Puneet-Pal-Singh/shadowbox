/**
 * Observability unit tests (logger and tracer)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ExecutionLogger, ExecutionTracer } from '../../src/observability/index.js'

describe('ExecutionLogger', () => {
  let logger: ExecutionLogger

  beforeEach(() => {
    logger = new ExecutionLogger('run-1')
  })

  it('logs at info level', () => {
    logger.info('domain', 'operation', 'test message')

    const logs = logger.getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].level).toBe('info')
    expect(logs[0].message).toBe('test message')
  })

  it('logs with context', () => {
    const context = { key: 'value' }
    logger.info('domain', 'operation', 'message', context)

    const logs = logger.getLogs()
    expect(logs[0].context).toEqual(context)
  })

  it('logs at different levels', () => {
    logger.info('d', 'o', 'info')
    logger.debug('d', 'o', 'debug')
    logger.warn('d', 'o', 'warn')
    logger.error('d', 'o', 'error')

    const logs = logger.getLogs()
    expect(logs).toHaveLength(4)
    expect(logs.map(l => l.level)).toEqual(['info', 'debug', 'warn', 'error'])
  })

  it('filters logs by level', () => {
    logger.info('d', 'o', 'info')
    logger.error('d', 'o', 'error')
    logger.info('d', 'o', 'info2')

    const errors = logger.getLogsByLevel('error')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('error')
  })

  it('clears logs', () => {
    logger.info('d', 'o', 'message')
    expect(logger.getLogs()).toHaveLength(1)

    logger.clearLogs()
    expect(logger.getLogs()).toHaveLength(0)
  })

  it('logs events', () => {
    logger.logEvent({
      type: 'execution_started',
      runId: 'run-1',
      planId: 'plan-1',
      timestamp: Date.now()
    })

    const logs = logger.getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].message).toContain('execution started')
  })
})

describe('ExecutionTracer', () => {
  let tracer: ExecutionTracer

  beforeEach(() => {
    tracer = new ExecutionTracer('run-1')
  })

  it('tracks execution timeline', () => {
    tracer.startSpan('span-1', 'operation')
    tracer.endSpan('span-1')

    const timeline = tracer.finish()
    expect(timeline.spans).toHaveLength(1)
    expect(timeline.spans[0].duration).toBeGreaterThanOrEqual(0)
  })

  it('tracks nested spans', () => {
    const parent = tracer.startSpan('parent', 'parent-op')
    const child = tracer.startSpan('child', 'child-op')
    tracer.endSpan('child')
    tracer.endSpan('parent')

    const timeline = tracer.finish()
    expect(timeline.spans).toHaveLength(2)
    expect(timeline.spans[1].parentId).toBe(parent.id)
  })

  it('calculates total duration', () => {
    tracer.startSpan('span-1', 'op')
    tracer.endSpan('span-1')

    const duration = tracer.getTotalDuration()
    expect(duration).toBeGreaterThanOrEqual(0)
  })

  it('marks spans with status', () => {
    tracer.startSpan('span-1', 'op')
    tracer.endSpan('span-1', 'completed')

    const timeline = tracer.finish()
    expect(timeline.spans[0].status).toBe('completed')
  })

  it('handles failed spans', () => {
    tracer.startSpan('span-1', 'op')
    tracer.endSpan('span-1', 'failed')

    const timeline = tracer.finish()
    expect(timeline.spans[0].status).toBe('failed')
  })

  it('tracks span metadata', () => {
    const metadata = { key: 'value', count: 42 }
    tracer.startSpan('span-1', 'op', metadata)
    tracer.endSpan('span-1')

    const timeline = tracer.finish()
    expect(timeline.spans[0].metadata).toEqual(metadata)
  })

  it('finds critical path', () => {
    const parent = tracer.startSpan('parent', 'parent-op')
    tracer.startSpan('child-1', 'child-1-op')
    tracer.endSpan('child-1')
    tracer.startSpan('child-2', 'child-2-op')
    tracer.endSpan('child-2')
    tracer.endSpan(parent.id)

    tracer.finish()
    const path = tracer.getCriticalPath()

    expect(path.length).toBeGreaterThanOrEqual(1)
    expect(path[0].id).toBe(parent.id)
  })
})
