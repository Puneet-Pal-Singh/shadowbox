import { describe, expect, it } from "vitest";
import {
  ProviderClientOperationError,
  isProviderErrorEnvelope,
  parseProviderErrorEnvelope,
} from "./errors.js";

describe("provider client errors", () => {
  it("parses canonical provider error envelope", () => {
    const envelope = {
      error: {
        code: "PROVIDER_UNAVAILABLE",
        message: "Provider is temporarily unavailable",
        retryable: true,
        correlationId: "corr-1",
      },
    };

    expect(isProviderErrorEnvelope(envelope)).toBe(true);
    expect(parseProviderErrorEnvelope(envelope)).toEqual(envelope);
  });

  it("returns null for non-conforming envelopes", () => {
    expect(isProviderErrorEnvelope({ error: "nope" })).toBe(false);
    expect(parseProviderErrorEnvelope({ error: "nope" })).toBeNull();
  });

  it("maps envelope into typed operation error", () => {
    const error = ProviderClientOperationError.fromEnvelope({
      error: {
        code: "PROVIDER_AUTH_FAILED",
        message: "Credential is invalid",
        retryable: false,
        correlationId: "corr-2",
      },
    });

    expect(error.code).toBe("PROVIDER_AUTH_FAILED");
    expect(error.retryable).toBe(false);
    expect(error.correlationId).toBe("corr-2");
  });
});
