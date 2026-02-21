import { z } from "zod";

export const PROVIDER_IDS = ["openrouter", "openai", "groq"] as const;

export const ProviderIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const ProviderCapabilityFlagsSchema = z.object({
  streaming: z.boolean(),
  tools: z.boolean(),
  structuredOutputs: z.boolean(),
  jsonMode: z.boolean(),
});
export type ProviderCapabilityFlags = z.infer<
  typeof ProviderCapabilityFlagsSchema
>;

export const ModelDescriptorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: ProviderIdSchema,
  contextWindow: z.number().int().positive().optional(),
  costPer1kTokens: z
    .object({
      input: z.number().nonnegative(),
      output: z.number().nonnegative(),
    })
    .optional(),
  description: z.string().optional(),
});
export type ModelDescriptor = z.infer<typeof ModelDescriptorSchema>;

export const ProviderCatalogEntrySchema = z.object({
  providerId: ProviderIdSchema,
  displayName: z.string().min(1),
  capabilities: ProviderCapabilityFlagsSchema,
  models: z.array(ModelDescriptorSchema),
});
export type ProviderCatalogEntry = z.infer<typeof ProviderCatalogEntrySchema>;

export const ProviderCatalogResponseSchema = z.object({
  providers: z.array(ProviderCatalogEntrySchema),
  generatedAt: z.string().datetime(),
});
export type ProviderCatalogResponse = z.infer<
  typeof ProviderCatalogResponseSchema
>;

export const ProviderConnectionStateSchema = z.enum([
  "connected",
  "disconnected",
  "failed",
  "revoked",
]);
export type ProviderConnectionState = z.infer<
  typeof ProviderConnectionStateSchema
>;

export const ProviderErrorCodeSchema = z.enum([
  "AUTH_FAILED",
  "MODEL_NOT_ALLOWED",
  "RATE_LIMITED",
  "PROVIDER_NOT_CONNECTED",
  "INVALID_PROVIDER_SELECTION",
  "PROVIDER_UNAVAILABLE",
  "VALIDATION_ERROR",
  "INTERNAL_ERROR",
]);
export type ProviderErrorCode = z.infer<typeof ProviderErrorCodeSchema>;

export const ProviderConnectionSchema = z.object({
  providerId: ProviderIdSchema,
  status: ProviderConnectionStateSchema,
  lastValidatedAt: z.string().datetime().optional(),
  keyFingerprint: z.string().optional(),
  errorCode: ProviderErrorCodeSchema.optional(),
  errorMessage: z.string().optional(),
  capabilities: ProviderCapabilityFlagsSchema.optional(),
});
export type ProviderConnection = z.infer<typeof ProviderConnectionSchema>;

export const ProviderConnectionsResponseSchema = z.object({
  connections: z.array(ProviderConnectionSchema),
});
export type ProviderConnectionsResponse = z.infer<
  typeof ProviderConnectionsResponseSchema
>;

export const BYOKConnectRequestSchema = z.object({
  providerId: ProviderIdSchema,
  apiKey: z.string().min(1).max(4096),
});
export type BYOKConnectRequest = z.infer<typeof BYOKConnectRequestSchema>;

export const BYOKConnectResponseSchema = z.object({
  status: z.enum(["connected", "failed"]),
  providerId: ProviderIdSchema,
  lastValidatedAt: z.string().datetime().optional(),
  errorMessage: z.string().optional(),
});
export type BYOKConnectResponse = z.infer<typeof BYOKConnectResponseSchema>;

export const BYOKDisconnectRequestSchema = z.object({
  providerId: ProviderIdSchema,
});
export type BYOKDisconnectRequest = z.infer<typeof BYOKDisconnectRequestSchema>;

export const BYOKDisconnectResponseSchema = z.object({
  status: z.literal("disconnected"),
  providerId: ProviderIdSchema,
});
export type BYOKDisconnectResponse = z.infer<typeof BYOKDisconnectResponseSchema>;

export const BYOKValidateRequestSchema = z.object({
  providerId: ProviderIdSchema,
});
export type BYOKValidateRequest = z.infer<typeof BYOKValidateRequestSchema>;

export const BYOKValidateResponseSchema = z.object({
  providerId: ProviderIdSchema,
  status: z.enum(["valid", "invalid"]),
  checkedAt: z.string().datetime(),
});
export type BYOKValidateResponse = z.infer<typeof BYOKValidateResponseSchema>;

export const BYOKPreferencesPatchSchema = z
  .object({
    defaultProviderId: ProviderIdSchema.optional(),
    defaultModelId: z.string().min(1).optional(),
  })
  .refine(
    (value) => value.defaultProviderId !== undefined || value.defaultModelId !== undefined,
    {
      message: "At least one preference field is required",
    },
  );
export type BYOKPreferencesPatch = z.infer<typeof BYOKPreferencesPatchSchema>;

export const BYOKPreferencesSchema = z.object({
  defaultProviderId: ProviderIdSchema.optional(),
  defaultModelId: z.string().min(1).optional(),
  updatedAt: z.string().datetime(),
});
export type BYOKPreferences = z.infer<typeof BYOKPreferencesSchema>;

export const NormalizedProviderErrorSchema = z.object({
  code: ProviderErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  correlationId: z.string().optional(),
});
export type NormalizedProviderError = z.infer<
  typeof NormalizedProviderErrorSchema
>;

export const ProviderErrorEnvelopeSchema = z.object({
  error: NormalizedProviderErrorSchema,
});
export type ProviderErrorEnvelope = z.infer<typeof ProviderErrorEnvelopeSchema>;
