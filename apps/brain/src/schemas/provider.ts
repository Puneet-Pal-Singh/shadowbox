/**
 * Provider Schema Definitions
 * Zod validation for provider requests and responses
 */

import { z } from "zod";

export const ProviderIdSchema = z.enum(["openrouter", "openai"]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const ConnectProviderRequestSchema = z
  .object({
    providerId: ProviderIdSchema,
    apiKey: z
      .string()
      .min(1, "API key cannot be empty")
      .min(10, "API key must be at least 10 characters")
      .regex(
        /^[a-zA-Z0-9\-_]+$/,
        "API key contains invalid characters (only alphanumeric, hyphens, underscores allowed)",
      ),
  })
  .refine(
    (data) => {
      // Provider-specific API key format validation
      if (data.providerId === "openai") {
        return data.apiKey.startsWith("sk-");
      }
      if (data.providerId === "openrouter") {
        return data.apiKey.startsWith("sk-or-");
      }
      return true;
    },
    {
      message: "Invalid API key format for this provider",
      path: ["apiKey"],
    },
  );

export type ConnectProviderRequest = z.infer<
  typeof ConnectProviderRequestSchema
>;

export const DisconnectProviderRequestSchema = z.object({
  providerId: ProviderIdSchema,
});

export type DisconnectProviderRequest = z.infer<
  typeof DisconnectProviderRequestSchema
>;

export const ProviderConnectionStatusSchema = z.object({
  providerId: ProviderIdSchema,
  status: z.enum(["disconnected", "connected", "failed"]),
  lastValidatedAt: z.string().datetime().optional(),
  errorMessage: z.string().optional(),
});

export type ProviderConnectionStatus = z.infer<
  typeof ProviderConnectionStatusSchema
>;

export const ConnectProviderResponseSchema = z.object({
  status: z.enum(["connected", "failed"]),
  providerId: ProviderIdSchema,
  lastValidatedAt: z.string().datetime().optional(),
  errorMessage: z.string().optional(),
});

export type ConnectProviderResponse = z.infer<
  typeof ConnectProviderResponseSchema
>;

export const DisconnectProviderResponseSchema = z.object({
  status: z.literal("disconnected"),
  providerId: ProviderIdSchema,
});

export type DisconnectProviderResponse = z.infer<
  typeof DisconnectProviderResponseSchema
>;

export const ModelDescriptorSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: ProviderIdSchema,
  contextWindow: z.number().optional(),
  costPer1kTokens: z
    .object({
      input: z.number(),
      output: z.number(),
    })
    .optional(),
  description: z.string().optional(),
});

export type ModelDescriptor = z.infer<typeof ModelDescriptorSchema>;

export const ModelsListResponseSchema = z.object({
  providerId: ProviderIdSchema,
  models: z.array(ModelDescriptorSchema),
  lastFetchedAt: z.string().datetime(),
});

export type ModelsListResponse = z.infer<typeof ModelsListResponseSchema>;

export const ProviderStatusResponseSchema = z.object({
  providers: z.array(ProviderConnectionStatusSchema),
});

export type ProviderStatusResponse = z.infer<
  typeof ProviderStatusResponseSchema
>;

/**
 * Schema for validating provider/model selection in chat requests
 * Ensures providerId and modelId are compatible combinations
 */
export const ChatProviderSelectionSchema = z
  .object({
    providerId: ProviderIdSchema.optional(),
    modelId: z.string().optional(),
  })
  .refine(
    (data) => {
      // If either providerId or modelId is provided, both should be provided together
      if ((data.providerId && !data.modelId) || (!data.providerId && data.modelId)) {
        return false;
      }
      return true;
    },
    {
      message:
        "providerId and modelId must be provided together or both omitted",
      path: ["providerId"],
    },
  );

export type ChatProviderSelection = z.infer<
  typeof ChatProviderSelectionSchema
>;
