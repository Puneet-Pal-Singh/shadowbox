/**
 * Execution event type definitions
 * Events emitted during execution lifecycle
 */

/**
 * Execution lifecycle events
 */
export type ExecutionEvent =
  | ExecutionStartedEvent
  | StepStartedEvent
  | ToolCalledEvent
  | ToolCompletedEvent
  | StepCompletedEvent
  | ExecutionCompletedEvent
  | ExecutionStoppedEvent
  | ExecutionFailedEvent

/**
 * Execution started event
 */
export interface ExecutionStartedEvent {
  type: 'execution_started'
  runId: string
  planId: string
  timestamp: number
}

/**
 * Step started event
 */
export interface StepStartedEvent {
  type: 'step_started'
  runId: string
  stepId: string
  stepTitle: string
  timestamp: number
}

/**
 * Tool invocation event
 */
export interface ToolCalledEvent {
  type: 'tool_called'
  runId: string
  stepId: string
  toolName: string
  timestamp: number
}

/**
 * Tool completion event
 */
export interface ToolCompletedEvent {
  type: 'tool_completed'
  runId: string
  stepId: string
  toolName: string
  status: 'success' | 'error'
  duration: number
  timestamp: number
}

/**
 * Step completion event
 */
export interface StepCompletedEvent {
  type: 'step_completed'
  runId: string
  stepId: string
  status: 'success' | 'error'
  duration: number
  timestamp: number
}

/**
 * Execution completion event
 */
export interface ExecutionCompletedEvent {
  type: 'execution_completed'
  runId: string
  status: 'completed'
  duration: number
  timestamp: number
}

/**
 * Execution stopped event
 */
export interface ExecutionStoppedEvent {
  type: 'execution_stopped'
  runId: string
  reason: string
  timestamp: number
}

/**
 * Execution failure event
 */
export interface ExecutionFailedEvent {
  type: 'execution_failed'
  runId: string
  error: string
  timestamp: number
}

/**
 * Event handler callback type
 */
export type EventHandler<T extends ExecutionEvent = ExecutionEvent> = (event: T) => void
