import { describe, it, expect } from "vitest";
import {
  BYOKErrorCodeSchema,
  BYOKErrorSchema,
  createBYOKError,
  isRetryableError,
  isAuthError,
} from "./error.js";

describe("BYOK Error Taxonomy", () => {
  it("validates error code enum", () => {
    const validCodes: Array<string> = [
      "CREDENTIAL_NOT_FOUND",
      "PROVIDER_NOT_CONNECTED",
      "RATE_LIMIT_EXCEEDED",
      "INTERNAL_ERROR",
    ];

    for (const code of validCodes) {
      const result = BYOKErrorCodeSchema.safeParse(code);
      expect(result.success).toBe(true);
    }
  });

  it("creates error with correct retryability", () => {
    const retryableError = createBYOKError(
      "PROVIDER_UNAVAILABLE",
      "Provider is temporarily unavailable",
    );

    expect(retryableError.retryable).toBe(true);
    expect(isRetryableError("PROVIDER_UNAVAILABLE")).toBe(true);
  });

  it("identifies auth errors", () => {
    const authError = createBYOKError(
      "CREDENTIAL_REVOKED",
      "Credential has been revoked",
    );

    expect(isAuthError("CREDENTIAL_REVOKED")).toBe(true);
    expect(authError.code).toBe("CREDENTIAL_REVOKED");
  });

  it("validates error with correlation ID", () => {
    const error = {
      code: "VALIDATION_ERROR" as const,
      message: "Invalid API key format",
      retryable: false,
      correlationId: "req-123-456",
    };

    const result = BYOKErrorSchema.safeParse(error);
    expect(result.success).toBe(true);
  });
});
