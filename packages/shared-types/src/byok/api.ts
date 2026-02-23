/**
 * BYOK API Request/Response Contracts
 *
 * HTTP API contracts for BYOK operations.
 */

import { z } from "zod";

/**
 * BYOKConnectRequest - API request to connect a new credential
 *
 * Client sends this to `POST /api/byok/credentials`.
 * Validation mode can be "format" (quick) or "live" (call provider).
 */
export const BYOKConnectRequestSchema = z.object({
  providerId: z.string().min(1).max(64),
  apiKey: z.string().min(1).max(4096),
  label: z.string().min(1).max(256),
  validationMode: z.enum(["format", "live"]).default("format"),
});

export type BYOKConnectRequest = z.infer<typeof BYOKConnectRequestSchema>;

/**
 * BYOKConnectResponse - Response from credential connect
 */
export const BYOKConnectResponseSchema = z.object({
  status: z.enum(["connected", "failed"]),
  credential: z
    .object({
      credentialId: z.string().uuid(),
      providerId: z.string(),
      label: z.string(),
      keyFingerprint: z.string(),
      status: z.enum(["connected", "failed", "revoked"]),
      createdAt: z.string().datetime(),
    })
    .optional(),
  validationResult: z
    .object({
      valid: z.boolean(),
      error: z.string().optional(),
    })
    .optional(),
});

export type BYOKConnectResponse = z.infer<typeof BYOKConnectResponseSchema>;

/**
 * BYOKValidateRequest - API request to validate an existing credential
 */
export const BYOKValidateRequestSchema = z.object({
  credentialId: z.string().uuid(),
  validationMode: z.enum(["format", "live"]).default("format"),
});

export type BYOKValidateRequest = z.infer<typeof BYOKValidateRequestSchema>;

/**
 * BYOKValidateResponse - Response from credential validation
 */
export const BYOKValidateResponseSchema = z.object({
  credentialId: z.string().uuid(),
  valid: z.boolean(),
  validatedAt: z.string().datetime(),
  error: z.string().optional(),
});

export type BYOKValidateResponse = z.infer<typeof BYOKValidateResponseSchema>;
