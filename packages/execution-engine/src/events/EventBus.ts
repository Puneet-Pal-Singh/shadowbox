/**
 * Event Bus - Internal event emitter for execution coordination
 * Supports typed event emission and subscription
 */

import type { ExecutionEvent, EventHandler } from './types.js'

/**
 * Internal event bus for execution lifecycle
 * Enables loose coupling between components
 */
export class EventBus {
  private listeners: Map<string, Set<EventHandler>> = new Map()

  /**
   * Register event handler for specific event type
   */
  on<T extends ExecutionEvent>(eventType: T['type'], handler: EventHandler<T>): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)?.add(handler as EventHandler)
  }

  /**
   * Register one-time event handler
   */
  once<T extends ExecutionEvent>(eventType: T['type'], handler: EventHandler<T>): void {
    const wrappedHandler: EventHandler = (event: ExecutionEvent) => {
      handler(event as T)
      this.off(eventType, wrappedHandler as EventHandler<T>)
    }
    this.on(eventType, wrappedHandler as EventHandler<T>)
  }

  /**
   * Unregister event handler
   */
  off<T extends ExecutionEvent>(eventType: T['type'], handler: EventHandler<T>): void {
    const handlers = this.listeners.get(eventType)
    if (handlers) {
      handlers.delete(handler as EventHandler)
    }
  }

  /**
   * Emit event to all registered handlers
   */
  emit<T extends ExecutionEvent>(event: T): void {
    const handlers = this.listeners.get(event.type)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event)
        } catch (error) {
          console.error(`[events/bus] Handler error for ${event.type}:`, error)
        }
      }
    }
  }

  /**
   * Remove all listeners (useful for cleanup/testing)
   */
  clear(): void {
    this.listeners.clear()
  }

  /**
   * Get count of listeners for a specific event type
   */
  getListenerCount(eventType: ExecutionEvent['type']): number {
    return this.listeners.get(eventType)?.size ?? 0
  }
}
