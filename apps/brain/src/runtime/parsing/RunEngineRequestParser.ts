/**
 * RunEngineRequestParser - Parse and validate runtime execute requests.
 *
 * Single Responsibility: Parse HTTP request body and validate against schema.
 * Provides typed, validated payload or throws ParseError.
 */

import { ParseError, ValidationError } from "../../domain/errors";
import {
  ExecuteRunPayloadSchema,
  type ExecuteRunPayload,
} from "./ExecuteRunPayloadSchema";

/**
 * Parse HTTP request body as JSON and validate against ExecuteRunPayloadSchema.
 *
 * @param request - HTTP request with JSON body
 * @returns Parsed and validated ExecuteRunPayload
 * @throws ParseError if JSON is malformed
 * @throws ValidationError if payload doesn't match schema
 */
export async function parseExecuteRunRequest(
  request: Request,
): Promise<ExecuteRunPayload> {
  // Parse JSON
  let json: unknown;
  try {
    json = await request.json();
  } catch (error) {
    const message = error instanceof SyntaxError
      ? "Malformed JSON in request body"
      : "Failed to parse request body";
    throw new ParseError(message, "PARSE_ERROR");
  }

  // Validate schema
  const result = ExecuteRunPayloadSchema.safeParse(json);
  if (!result.success) {
    const messages = result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");
    throw new ValidationError(
      `Invalid execute payload: ${messages}`,
      "INVALID_PAYLOAD",
    );
  }

  return result.data;
}
