/**
 * HTTP API Schemas
 * Zod validation for all HTTP endpoints
 *
 * SOLID: Single responsibility (request/response validation)
 * Type Safety: All inputs validated at runtime
 */

import { z } from "zod";

/**
 * Session Management Schemas
 */

export const SessionCreateRequestSchema = z.object({
  runId: z.string().min(1, "runId required"),
  taskId: z.string().min(1, "taskId required"),
  repoPath: z
    .string()
    .min(1, "repoPath required")
    .refine(
      (path) => !path.startsWith("/"),
      "repoPath must be relative, not absolute",
    )
    .refine(
      (path) => !path.includes(".."),
      "repoPath must not contain path traversal",
    ),
  metadata: z.record(z.unknown()).optional(),
});

export type SessionCreateRequest = z.infer<typeof SessionCreateRequestSchema>;

export const SessionCreateResponseSchema = z.object({
  sessionId: z.string().min(1),
  token: z.string().min(1),
  expiresAt: z.number().int().positive(),
  manifest: z.unknown().optional(),
});

export type SessionCreateResponse = z.infer<typeof SessionCreateResponseSchema>;

/**
 * Task Execution Schemas
 */

export const ExecuteTaskRequestSchema = z.object({
  sessionId: z.string().min(1, "sessionId required"),
  command: z.string().min(1, "command required"),
  cwd: z
    .string()
    .min(1, "cwd required")
    .refine(
      (path) => !path.startsWith("/"),
      "cwd must be relative, not absolute",
    )
    .refine(
      (path) => !path.includes(".."),
      "cwd must not contain path traversal",
    )
    .refine((path) => !path.includes("\\"), "cwd must use unix-style paths"),
  timeout: z.number().int().positive().optional(),
  env: z.record(z.string()).optional(),
});

export type ExecuteTaskRequest = z.infer<typeof ExecuteTaskRequestSchema>;

export const ExecuteTaskResponseSchema = z.object({
  exitCode: z.number().int().nonnegative(),
  stdout: z.string(),
  stderr: z.string(),
  duration: z.number().int().nonnegative(),
  status: z.enum(["success", "error", "timeout"]),
  timestamp: z.number().int().positive(),
});

export type ExecuteTaskResponse = z.infer<typeof ExecuteTaskResponseSchema>;

/**
 * Log Streaming Schemas
 */

export const LogStreamQuerySchema = z.object({
  sessionId: z.string().min(1, "sessionId required"),
  since: z.coerce.number().int().positive().optional(),
});

export type LogStreamQuery = z.infer<typeof LogStreamQuerySchema>;

export const LogEntrySchema = z.object({
  timestamp: z.number().int().positive(),
  level: z.enum(["info", "warn", "error", "debug"]),
  message: z.string(),
  source: z.enum(["stdout", "stderr"]).optional(),
});

export type LogEntry = z.infer<typeof LogEntrySchema>;

/**
 * Session Cleanup Schemas
 */

export const DeleteSessionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

export type DeleteSessionResponse = z.infer<typeof DeleteSessionResponseSchema>;

/**
 * Error Response Schema
 */

export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string(),
  details: z.unknown().optional(),
  timestamp: z.number().int().positive(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * Helper: Validate request body with Zod
 */
export async function validateRequestBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ valid: true; data: T } | { valid: false; error: string }> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      const messages = result.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; ");
      return { valid: false, error: messages };
    }

    return { valid: true, data: result.data };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Invalid JSON";
    return { valid: false, error: `Request parsing failed: ${msg}` };
  }
}

/**
 * Helper: Validate query parameters with Zod
 */
export function validateQueryParams<T>(
  url: URL,
  schema: z.ZodType<T>,
): { valid: true; data: T } | { valid: false; error: string } {
  try {
    const params: Record<string, string | null> = {};

    for (const [key, value] of url.searchParams.entries()) {
      params[key] = value;
    }

    const result = schema.safeParse(params);

    if (!result.success) {
      const messages = result.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; ");
      return { valid: false, error: messages };
    }

    return { valid: true, data: result.data };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Query parsing failed";
    return { valid: false, error: msg };
  }
}

/**
 * Helper: Create JSON response
 */
export function jsonResponse<T>(
  data: T,
  status: number = 200,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

/**
 * Helper: Create error response
 */
export function errorResponse(
  error: string,
  code: string,
  status: number = 400,
  details?: unknown,
): Response {
  const response: ErrorResponse = {
    error,
    code,
    details,
    timestamp: Date.now(),
  };
  return jsonResponse(response, status);
}

/**
 * Helper: Extract path parameter
 */
export function getPathParam(url: URL, paramIndex: number): string | null {
  const parts = url.pathname.split("/");
  return parts[paramIndex] || null;
}

/**
 * Chat History Schemas
 */
export const ChatHistoryQuerySchema = z.object({
  runId: z.string().min(1, "runId required"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ChatHistoryQuery = z.infer<typeof ChatHistoryQuerySchema>;

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1, "content required"),
  idempotencyKey: z.string().optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatAppendRequestSchema = z
  .object({
    message: ChatMessageSchema.optional(),
    messages: z.array(ChatMessageSchema).optional(),
    idempotencyKey: z.string().optional(),
  })
  .refine(
    (data) => data.message || (data.messages && data.messages.length > 0),
    "Either message or messages array must be provided",
  );

export type ChatAppendRequest = z.infer<typeof ChatAppendRequestSchema>;

/**
 * Execution Schemas
 */
export const ExecutionBodySchema = z.object({
  plugin: z.string().min(1, "plugin required"),
  payload: z.record(z.unknown()),
});

export type ExecutionBody = z.infer<typeof ExecutionBodySchema>;
