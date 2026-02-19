/**
 * Shared HTTP validation primitives for Brain controllers.
 *
 * Single Responsibility: Parse and validate request bodies with consistent
 * error handling and zod schema support.
 */

import type { ZodSchema } from "zod";
import { ParseError, ValidationError } from "../domain/errors";

/**
 * Parse request body as JSON.
 *
 * @param request - The HTTP request
 * @param correlationId - Request correlation ID for error tracking
 * @returns Parsed JSON body
 * @throws ParseError if JSON is malformed
 */
export async function parseRequestBody(
  request: Request,
  correlationId?: string,
): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    const message = error instanceof SyntaxError
      ? "Malformed JSON in request body"
      : "Failed to parse request body";
    throw new ParseError(message, "PARSE_ERROR", correlationId);
  }
}

/**
 * Validate parsed data against a zod schema.
 *
 * @param data - The data to validate
 * @param schema - The zod schema
 * @param correlationId - Request correlation ID for error tracking
 * @returns The validated data (type-safe)
 * @throws ValidationError if schema validation fails
 */
export function validateWithSchema<T = unknown>(
  data: unknown,
  schema: ZodSchema,
  correlationId?: string,
): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const messages = result.error.errors
      .map((e) =>
        e.path.length > 0
          ? `${e.path.join(".")}: ${e.message}`
          : e.message,
      )
      .join("; ");
    throw new ValidationError(
      `Validation error: ${messages}`,
      "VALIDATION_ERROR",
      correlationId,
    );
  }

  return result.data as T;
}

/**
 * Combined: parse JSON body and validate against schema.
 *
 * @param request - The HTTP request
 * @param schema - The zod schema
 * @param correlationId - Request correlation ID for error tracking
 * @returns The validated data (type-safe)
 * @throws ParseError if JSON is malformed
 * @throws ValidationError if validation fails
 */
export async function parseAndValidate<T = unknown>(
  request: Request,
  schema: ZodSchema,
  correlationId?: string,
): Promise<T> {
  const body = await parseRequestBody(request, correlationId);
  return validateWithSchema<T>(body, schema, correlationId);
}
