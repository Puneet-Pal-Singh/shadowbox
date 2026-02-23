import { describe, it, expect } from "vitest";
import { BYOKPreferenceSchema } from "./preference.js";

describe("BYOK Preference Entity", () => {
  it("validates preference with defaults", () => {
    const preference = {
      userId: "user123",
      workspaceId: "workspace456",
      defaultProviderId: "openai",
      defaultModelId: "gpt-4-turbo",
      updatedAt: "2025-02-23T10:00:00Z",
    };

    const result = BYOKPreferenceSchema.safeParse(preference);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fallbackMode).toBe("strict");
      expect(result.data.fallbackChain).toEqual([]);
    }
  });

  it("validates preference with fallback chain", () => {
    const preference = {
      userId: "user123",
      workspaceId: "workspace456",
      defaultProviderId: "openai",
      fallbackMode: "allow_fallback" as const,
      fallbackChain: ["groq", "openrouter"],
      updatedAt: "2025-02-23T10:00:00Z",
    };

    const result = BYOKPreferenceSchema.safeParse(preference);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fallbackChain).toEqual(["groq", "openrouter"]);
    }
  });
});
