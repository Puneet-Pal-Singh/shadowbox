import { describe, it, expect } from "vitest";
import { BYOKResolutionSchema } from "./resolution.js";

describe("BYOK Resolution", () => {
  it("validates resolution result", () => {
    const resolution = {
      providerId: "openai",
      credentialId: "550e8400-e29b-41d4-a716-446655440000",
      modelId: "gpt-4-turbo",
      resolvedAt: "request_override" as const,
      resolvedAtTime: "2025-02-23T10:00:00Z",
    };

    const result = BYOKResolutionSchema.safeParse(resolution);
    expect(result.success).toBe(true);
  });

  it("validates platform defaults resolution", () => {
    const resolution = {
      providerId: "groq",
      credentialId: "550e8400-e29b-41d4-a716-446655440001",
      modelId: "mixtral-8x7b-32768",
      resolvedAt: "platform_defaults" as const,
      resolvedAtTime: "2025-02-23T10:00:00Z",
    };

    const result = BYOKResolutionSchema.safeParse(resolution);
    expect(result.success).toBe(true);
  });

  it("rejects deprecated fallback resolution source", () => {
    const resolution = {
      providerId: "openai",
      credentialId: "550e8400-e29b-41d4-a716-446655440000",
      modelId: "gpt-4-turbo",
      resolvedAt: "platform_fallback",
      resolvedAtTime: "2025-02-23T10:00:00Z",
    };

    const result = BYOKResolutionSchema.safeParse(resolution);
    expect(result.success).toBe(false);
  });
});
