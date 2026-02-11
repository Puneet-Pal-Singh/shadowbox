/**
 * Tool Input Validator - Validate and sanitize tool arguments
 */

import { z } from 'zod'

/**
 * Validate file path to prevent directory traversal
 * Uses Node.js path.resolve for proper normalization
 */
export function validateFilePath(path: string, basePath: string): {
  valid: boolean
  error?: string
  normalizedPath?: string
} {
  if (!path || typeof path !== 'string') {
    return { valid: false, error: 'Path must be a non-empty string' }
  }

  if (!basePath || typeof basePath !== 'string') {
    return { valid: false, error: 'Base path must be a non-empty string' }
  }

  // Use built-in string operations for path normalization
  // (avoiding Node.js path module for browser compatibility)
  const separator = basePath.includes('\\') ? '\\' : '/'

  // Resolve relative paths
  let normalized = path
  if (!normalized.startsWith(separator)) {
    normalized = `${basePath}${separator}${normalized}`
  }

  // Remove // duplicates
  normalized = normalized.replace(/\/+/g, '/')
  normalized = normalized.replace(/\\+/g, '\\')

  // Prevent directory traversal
  if (normalized.includes('..') || normalized.includes('//') || normalized.includes('\\\\')) {
    return { valid: false, error: 'Path traversal detected' }
  }

  // Ensure it's within base path (both must use same separator)
  const base = basePath.endsWith(separator) ? basePath : basePath + separator
  if (!normalized.startsWith(base)) {
    return { valid: false, error: 'Path is outside allowed base directory' }
  }

  return { valid: true, normalizedPath: normalized }
}

/**
 * Validate command arguments to prevent injection
 */
export function validateCommand(command: string): {
  valid: boolean
  error?: string
} {
  if (!command || typeof command !== 'string') {
    return { valid: false, error: 'Command must be a non-empty string' }
  }

  // Reject dangerous patterns
  const dangerousPatterns = [
    /;\s*rm\s/i, // rm commands
    />\s*\/dev\/null/i, // redirects to /dev/null
    /;\s*killall/i, // killall commands
    /\$\(/i, // command substitution
    /`/i, // backtick substitution
    /\|\s*bash/i, // pipe to bash
    /sudo\s/i // sudo elevation
  ]

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return { valid: false, error: `Dangerous command pattern detected: ${pattern}` }
    }
  }

  return { valid: true }
}

/**
 * Validate generic arguments against schema
 */
export function validateArguments(
  args: unknown,
  schema: z.ZodSchema
): { valid: boolean; error?: string; data?: unknown } {
  try {
    const data = schema.parse(args)
    return { valid: true, data }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
      return { valid: false, error: issues }
    }
    return { valid: false, error: String(error) }
  }
}

/**
 * Validate string argument
 */
export function validateStringArg(
  value: unknown,
  fieldName: string,
  options?: {
    minLength?: number
    maxLength?: number
    pattern?: RegExp
  }
): { valid: boolean; error?: string } {
  if (typeof value !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` }
  }

  if (options?.minLength && value.length < options.minLength) {
    return {
      valid: false,
      error: `${fieldName} must be at least ${options.minLength} characters`
    }
  }

  if (options?.maxLength && value.length > options.maxLength) {
    return {
      valid: false,
      error: `${fieldName} must be at most ${options.maxLength} characters`
    }
  }

  if (options?.pattern && !options.pattern.test(value)) {
    return { valid: false, error: `${fieldName} does not match required pattern` }
  }

  return { valid: true }
}

/**
 * Validate number argument
 */
export function validateNumberArg(
  value: unknown,
  fieldName: string,
  options?: {
    min?: number
    max?: number
    integer?: boolean
  }
): { valid: boolean; error?: string } {
  if (typeof value !== 'number') {
    return { valid: false, error: `${fieldName} must be a number` }
  }

  if (options?.integer && !Number.isInteger(value)) {
    return { valid: false, error: `${fieldName} must be an integer` }
  }

  if (options?.min !== undefined && value < options.min) {
    return { valid: false, error: `${fieldName} must be at least ${options.min}` }
  }

  if (options?.max !== undefined && value > options.max) {
    return { valid: false, error: `${fieldName} must be at most ${options.max}` }
  }

  return { valid: true }
}
