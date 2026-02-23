import { describe, it, expect } from "vitest";
import {
  BYOKErrorCodeSchema,
  BYOKErrorSchema,
  BYOKValidationErrorDetailSchema,
  createBYOKError,
  createBYOKErrorInternal,
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

  it("client error strips details field if provided", () => {
    const clientError = {
      code: "VALIDATION_ERROR" as const,
      message: "Invalid API key format",
      retryable: false,
      details: { internalPath: "/secret/path" },
    };

    const result = BYOKErrorSchema.safeParse(clientError);
    expect(result.success).toBe(true);
    if (result.success) {
      // Details field is stripped (not included in the parsed result)
      expect("details" in result.data).toBe(false);
    }
  });

  it("validates retryAfterMs as positive integer", () => {
    const validError = createBYOKError(
      "RATE_LIMIT_EXCEEDED",
      "Rate limit exceeded",
      { retryAfterMs: 60000 },
    );
    expect(validError.retryAfterMs).toBe(60000);
  });

  it("rejects retryAfterMs with non-positive values", () => {
    expect(() =>
      createBYOKError("RATE_LIMIT_EXCEEDED", "Rate limit exceeded", {
        retryAfterMs: 0,
      }),
    ).toThrow("retryAfterMs must be a positive integer");

    expect(() =>
      createBYOKError("RATE_LIMIT_EXCEEDED", "Rate limit exceeded", {
        retryAfterMs: -500,
      }),
    ).toThrow("retryAfterMs must be a positive integer");

    expect(() =>
      createBYOKError("RATE_LIMIT_EXCEEDED", "Rate limit exceeded", {
        retryAfterMs: 3.5,
      }),
    ).toThrow("retryAfterMs must be a positive integer");
  });

  it("validation error details require non-empty fields", () => {
    const validDetail = {
      field: "apiKey",
      code: "INVALID_FORMAT",
      message: "API key does not match expected format",
    };

    const result = BYOKValidationErrorDetailSchema.safeParse(validDetail);
    expect(result.success).toBe(true);
  });

  it("validation error details reject empty fields", () => {
    const invalidDetail = {
      field: "",
      code: "INVALID_FORMAT",
      message: "API key does not match expected format",
    };

    const result = BYOKValidationErrorDetailSchema.safeParse(invalidDetail);
    expect(result.success).toBe(false);
  });

  it("internal error with details is separate from client error", () => {
    const internalError = createBYOKErrorInternal(
      "VALIDATION_ERROR",
      "Invalid key",
      {
        details: {
          internalPath: "/secret/path",
          userId: "abc123",
        },
      },
    );

    expect(internalError.details).toBeDefined();
    expect(internalError.details?.internalPath).toBe("/secret/path");

    // Verify client error doesn't have details
    const clientError = createBYOKError("VALIDATION_ERROR", "Invalid key");
    expect("details" in clientError).toBe(false);
  });
});
