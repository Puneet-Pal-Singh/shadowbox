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
    if (result.success) {
      expect(result.data.fallbackUsed).toBe(false);
    }
  });

  it("validates resolution with fallback", () => {
    const resolution = {
      providerId: "groq",
      credentialId: "550e8400-e29b-41d4-a716-446655440001",
      modelId: "mixtral-8x7b-32768",
      resolvedAt: "workspace_preference" as const,
      resolvedAtTime: "2025-02-23T10:00:00Z",
      fallbackUsed: true,
    };

    const result = BYOKResolutionSchema.safeParse(resolution);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fallbackUsed).toBe(true);
    }
  });
});
