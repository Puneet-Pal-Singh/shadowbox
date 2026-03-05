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
  });

  it("validates preference with visible model overrides", () => {
    const preference = {
      userId: "user123",
      workspaceId: "workspace456",
      defaultProviderId: "openai",
      visibleModelIds: {
        openai: ["gpt-4o"],
      },
      updatedAt: "2025-02-23T10:00:00Z",
    };

    const result = BYOKPreferenceSchema.safeParse(preference);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visibleModelIds.openai).toEqual(["gpt-4o"]);
    }
  });
});
