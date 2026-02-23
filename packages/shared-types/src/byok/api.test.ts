import { describe, it, expect } from "vitest";
import {
  BYOKConnectRequestSchema,
  BYOKValidateRequestSchema,
} from "./api.js";

describe("BYOK API Contracts", () => {
  it("validates connect request", () => {
    const request = {
      providerId: "openai",
      apiKey: "sk-test-FAKE-KEY-DO-NOT-USE",
      label: "My OpenAI Key",
      validationMode: "format" as const,
    };

    const result = BYOKConnectRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });

  it("validates validate request", () => {
    const request = {
      credentialId: "550e8400-e29b-41d4-a716-446655440000",
      validationMode: "live" as const,
    };

    const result = BYOKValidateRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });
});
