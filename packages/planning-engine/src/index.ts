/**
 * Planning Engine
 *
 * Public API for the planning engine service.
 * Exports types, schemas, and error classes.
 * Services exported separately to allow selective imports.
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  Plan,
  PlanStep,
  PlanMetadata,
  PlanningInput,
  PlanningOutput,
  PlanningStrategy,
  PlanningConstraints,
  Constraint,
  StepAction,
  ConstraintType,
  ChatTurn,
  ExecutionResult,
  PlanValidationResult,
  ValidationError as ValidationErrorType,
  ValidationWarning,
} from './types.js';

// ============================================================================
// Schema Exports (Zod validators)
// ============================================================================

export {
  PlanSchema,
  PlanStepSchema,
  ConstraintSchema,
  PlanMetadataSchema,
  PlanningStrategySchema,
  StepActionSchema,
  ConstraintTypeSchema,
  SeveritySchema,
  PlanningOutputSchema,
  ExecutionResultSchema,
  PlanValidationResultSchema,
  validatePlan,
  safeParsePlan,
  validatePlanningOutput,
  validateExecutionResult,
  validateValidationResult,
} from './schemas.js';

// ============================================================================
// Error Exports
// ============================================================================

export {
  PlanningError,
  ValidationError,
  PlanGenerationError,
  PlanValidationError,
  DependencyError,
  StrategyError,
  ConstraintError,
  assert,
} from './errors/index.js';
