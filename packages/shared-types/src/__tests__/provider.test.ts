import { describe, expect, it } from "vitest";
import {
  BYOKConnectRequestSchema,
  BYOKPreferencesPatchSchema,
  ProviderCatalogResponseSchema,
  ProviderErrorEnvelopeSchema,
} from "../provider.js";

describe("provider shared contracts", () => {
  it("accepts valid connect payload", () => {
    const payload = {
      providerId: "openai",
      apiKey: "sk_test_1234567890",
    };
    const result = BYOKConnectRequestSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects empty preference patch", () => {
    const result = BYOKPreferencesPatchSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts catalog response with capability flags", () => {
    const result = ProviderCatalogResponseSchema.safeParse({
      providers: [
        {
          providerId: "groq",
          displayName: "Groq",
          capabilities: {
            streaming: true,
            tools: true,
            structuredOutputs: true,
            jsonMode: true,
          },
          models: [
            {
              id: "llama-3.3-70b-versatile",
              name: "Llama 3.3 70B",
              provider: "groq",
            },
          ],
        },
      ],
      generatedAt: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
  });

  it("accepts normalized provider error envelope", () => {
    const result = ProviderErrorEnvelopeSchema.safeParse({
      error: {
        code: "AUTH_FAILED",
        message: "Credential rejected by provider",
        retryable: false,
        correlationId: "corr-1",
      },
    });
    expect(result.success).toBe(true);
  });
});
