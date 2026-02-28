import { describe, expect, it } from "vitest";
import {
  CredentialVaultEntrySchema,
  CredentialVaultSurfaceSchema,
  CredentialVaultUnsupportedOperationError,
} from "./credential-vault.js";

describe("credential vault contracts", () => {
  it("accepts supported vault surfaces", () => {
    expect(CredentialVaultSurfaceSchema.safeParse("cloud").success).toBe(true);
    expect(CredentialVaultSurfaceSchema.safeParse("desktop").success).toBe(true);
    expect(CredentialVaultSurfaceSchema.safeParse("mobile").success).toBe(false);
  });

  it("validates provider-neutral vault entries", () => {
    const parsed = CredentialVaultEntrySchema.safeParse({ providerId: "openai" });
    expect(parsed.success).toBe(true);
  });

  it("provides deterministic unsupported-operation error details", () => {
    const error = new CredentialVaultUnsupportedOperationError(
      "desktop",
      "setCredential",
    );
    expect(error.name).toBe("CredentialVaultUnsupportedOperationError");
    expect(error.message).toContain("setCredential");
    expect(error.message).toContain("desktop");
  });
});
