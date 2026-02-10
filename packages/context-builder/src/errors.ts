/**
 * Custom errors for ContextBuilder
 */

export class ValidationError extends Error {
  constructor(
    public field: string,
    message: string
  ) {
    super(`Validation error on field '${field}': ${message}`);
    this.name = 'ValidationError';
  }
}

export class ContextError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(`[${code}] ${message}`);
    this.name = 'ContextError';
  }
}

export class BudgetExceededError extends Error {
  constructor(
    public bucket: string,
    public limit: number,
    public actual: number
  ) {
    super(`Budget exceeded for ${bucket}: limit=${limit}, actual=${actual}`);
    this.name = 'BudgetExceededError';
  }
}
