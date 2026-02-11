/**
 * Event Bus unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { EventBus } from '../../src/events/index.js'
import type { ExecutionStartedEvent, StepStartedEvent } from '../../src/events/index.js'

describe('EventBus', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = new EventBus()
  })

  it('registers and emits events', () => {
    const events: ExecutionStartedEvent[] = []

    bus.on('execution_started', (event) => {
      events.push(event as ExecutionStartedEvent)
    })

    const event: ExecutionStartedEvent = {
      type: 'execution_started',
      runId: 'run-1',
      planId: 'plan-1',
      timestamp: Date.now()
    }

    bus.emit(event)

    expect(events).toHaveLength(1)
    expect(events[0].runId).toBe('run-1')
  })

  it('supports multiple handlers for same event', () => {
    const handler1Results: string[] = []
    const handler2Results: string[] = []

    bus.on('step_started', () => {
      handler1Results.push('handler1')
    })

    bus.on('step_started', () => {
      handler2Results.push('handler2')
    })

    const event: StepStartedEvent = {
      type: 'step_started',
      runId: 'run-1',
      stepId: 'step-1',
      stepTitle: 'Analyze',
      timestamp: Date.now()
    }

    bus.emit(event)

    expect(handler1Results).toHaveLength(1)
    expect(handler2Results).toHaveLength(1)
  })

  it('supports one-time handlers', () => {
    const events: ExecutionStartedEvent[] = []

    bus.once('execution_started', (event) => {
      events.push(event as ExecutionStartedEvent)
    })

    const event: ExecutionStartedEvent = {
      type: 'execution_started',
      runId: 'run-1',
      planId: 'plan-1',
      timestamp: Date.now()
    }

    bus.emit(event)
    bus.emit(event)

    expect(events).toHaveLength(1)
  })

  it('removes handlers', () => {
    const events: ExecutionStartedEvent[] = []
    const handler = (event: ExecutionStartedEvent) => {
      events.push(event)
    }

    bus.on('execution_started', handler)
    bus.off('execution_started', handler)

    const event: ExecutionStartedEvent = {
      type: 'execution_started',
      runId: 'run-1',
      planId: 'plan-1',
      timestamp: Date.now()
    }

    bus.emit(event)

    expect(events).toHaveLength(0)
  })

  it('clears all listeners', () => {
    bus.on('execution_started', () => {})
    bus.on('step_started', () => {})

    expect(bus.getListenerCount('execution_started')).toBe(1)
    expect(bus.getListenerCount('step_started')).toBe(1)

    bus.clear()

    expect(bus.getListenerCount('execution_started')).toBe(0)
    expect(bus.getListenerCount('step_started')).toBe(0)
  })

  it('tracks listener count', () => {
    expect(bus.getListenerCount('execution_started')).toBe(0)

    bus.on('execution_started', () => {})
    expect(bus.getListenerCount('execution_started')).toBe(1)

    bus.on('execution_started', () => {})
    expect(bus.getListenerCount('execution_started')).toBe(2)
  })

  it('handles handler errors gracefully', () => {
    const errorHandler = () => {
      throw new Error('Handler error')
    }
    const successHandler = () => {
      // no-op
    }

    bus.on('execution_started', errorHandler)
    bus.on('execution_started', successHandler)

    const event: ExecutionStartedEvent = {
      type: 'execution_started',
      runId: 'run-1',
      planId: 'plan-1',
      timestamp: Date.now()
    }

    expect(() => bus.emit(event)).not.toThrow()
  })
})
