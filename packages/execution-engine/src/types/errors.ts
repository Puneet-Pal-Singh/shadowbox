/**
 * Custom error types for execution engine
 */

export class ExecutionError extends Error {
  constructor(
    message: string,
    readonly stepId: string,
    readonly code: string,
    readonly originalError?: Error
  ) {
    super(message)
    this.name = 'ExecutionError'
    Object.setPrototypeOf(this, ExecutionError.prototype)
  }
}

export class StepFailureError extends ExecutionError {
  constructor(
    message: string,
    stepId: string,
    originalError?: Error
  ) {
    super(message, stepId, 'STEP_FAILURE', originalError)
    this.name = 'StepFailureError'
    Object.setPrototypeOf(this, StepFailureError.prototype)
  }
}

export class ToolExecutionError extends ExecutionError {
  constructor(
    message: string,
    stepId: string,
    readonly toolName: string,
    originalError?: Error
  ) {
    super(message, stepId, 'TOOL_EXECUTION_FAILED', originalError)
    this.name = 'ToolExecutionError'
    Object.setPrototypeOf(this, ToolExecutionError.prototype)
  }
}

export class ExecutionTimeoutError extends ExecutionError {
  constructor(
    message: string,
    stepId: string,
    readonly timeoutMs: number,
    originalError?: Error
  ) {
    super(message, stepId, 'EXECUTION_TIMEOUT', originalError)
    this.name = 'ExecutionTimeoutError'
    Object.setPrototypeOf(this, ExecutionTimeoutError.prototype)
  }
}

export class OutputValidationError extends ExecutionError {
  constructor(
    message: string,
    stepId: string,
    readonly output: unknown,
    originalError?: Error
  ) {
    super(message, stepId, 'OUTPUT_VALIDATION_FAILED', originalError)
    this.name = 'OutputValidationError'
    Object.setPrototypeOf(this, OutputValidationError.prototype)
  }
}

export class BudgetExhaustedError extends ExecutionError {
  constructor(
    message: string,
    stepId: string,
    readonly tokenUsage: number,
    readonly maxTokens: number
  ) {
    super(message, stepId, 'BUDGET_EXHAUSTED')
    this.name = 'BudgetExhaustedError'
    Object.setPrototypeOf(this, BudgetExhaustedError.prototype)
  }
}
