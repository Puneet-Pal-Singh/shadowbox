/**
 * Planning Engine Errors
 *
 * Custom error types for planning-engine operations.
 * All errors inherit from base Error class for proper instanceof checks.
 */

/**
 * Base error for all planning engine operations
 */
export class PlanningError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'PlanningError';
    Object.setPrototypeOf(this, PlanningError.prototype);
  }
}

/**
 * Thrown when input validation fails
 */
export class ValidationError extends PlanningError {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * Thrown when plan generation fails
 */
export class PlanGenerationError extends PlanningError {
  constructor(
    message: string,
    public readonly intent?: string,
  ) {
    super(message, 'PLAN_GENERATION_ERROR');
    this.name = 'PlanGenerationError';
  }
}

/**
 * Thrown when plan validation fails
 */
export class PlanValidationError extends PlanningError {
  constructor(
    message: string,
    public readonly planId?: string,
    public readonly details?: string[],
  ) {
    super(message, 'PLAN_VALIDATION_ERROR');
    this.name = 'PlanValidationError';
  }
}

/**
 * Thrown when a step dependency graph is invalid (cyclic, etc.)
 */
export class DependencyError extends PlanValidationError {
  declare code: string;

  constructor(
    message: string,
    public readonly stepId?: string,
  ) {
    super(message, undefined, [`Step: ${stepId}`]);
    this.code = 'DEPENDENCY_ERROR';
    this.name = 'DependencyError';
  }
}

/**
 * Thrown when strategy resolution fails
 */
export class StrategyError extends PlanningError {
  constructor(
    message: string,
    public readonly intent?: string,
  ) {
    super(message, 'STRATEGY_ERROR');
    this.name = 'StrategyError';
  }
}

/**
 * Thrown when constraint analysis fails
 */
export class ConstraintError extends PlanningError {
  constructor(
    message: string,
    public readonly constraint?: string,
  ) {
    super(message, 'CONSTRAINT_ERROR');
    this.name = 'ConstraintError';
  }
}

/**
 * Assertion helper for planning engine
 */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new ValidationError(message);
  }
}
