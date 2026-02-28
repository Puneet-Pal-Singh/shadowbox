import { describe, it, expect } from "vitest";
import {
  BYOKConnectRequestSchema,
  BYOKConnectResponseSchema,
  BYOKValidateRequestSchema,
  BYOKValidateResponseSchema,
} from "./api.js";
import {
  BYOKConnectRequestSchema as ProviderConnectRequestSchema,
  BYOKConnectResponseSchema as ProviderConnectResponseSchema,
  BYOKValidateRequestSchema as ProviderValidateRequestSchema,
  BYOKValidateResponseSchema as ProviderValidateResponseSchema,
} from "../provider.js";

describe("BYOK API Contracts", () => {
  it("validates connect request", () => {
    const request = {
      providerId: "openai",
      apiKey: "sk-test-FAKE-KEY-DO-NOT-USE",
    };

    const result = BYOKConnectRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });

  it("validates validate request", () => {
    const request = {
      providerId: "openai",
      mode: "live" as const,
    };

    const result = BYOKValidateRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });

  it("accepts canonical connect response shape", () => {
    const response = {
      status: "connected" as const,
      providerId: "openai",
      lastValidatedAt: new Date().toISOString(),
    };

    const result = BYOKConnectResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("accepts canonical validate response shape", () => {
    const response = {
      providerId: "openai",
      status: "valid" as const,
      checkedAt: new Date().toISOString(),
      validationMode: "format" as const,
    };

    const result = BYOKValidateResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("re-exports canonical provider schemas to prevent drift", () => {
    expect(BYOKConnectRequestSchema).toBe(ProviderConnectRequestSchema);
    expect(BYOKConnectResponseSchema).toBe(ProviderConnectResponseSchema);
    expect(BYOKValidateRequestSchema).toBe(ProviderValidateRequestSchema);
    expect(BYOKValidateResponseSchema).toBe(ProviderValidateResponseSchema);
  });
});
