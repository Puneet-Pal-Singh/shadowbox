import { describe, expect, it } from "vitest";
import { DomainError } from "../domain/errors";
import { mapRunExecutionErrorToDomain } from "./RunExecutionErrorMapper";

describe("RunExecutionErrorMapper", () => {
  it("passes through existing domain errors", () => {
    const error = new DomainError("SOME_CODE", "Domain failure", 422, false);

    const mapped = mapRunExecutionErrorToDomain(error, "corr-1");

    expect(mapped).toBe(error);
  });

  it("maps run manifest mismatch errors to typed immutable-manifest conflict", () => {
    const error = new Error(
      "[run/manifest] Immutable run manifest mismatch. existing={} candidate={}",
    );
    error.name = "RunManifestMismatchError";

    const mapped = mapRunExecutionErrorToDomain(error, "corr-2");

    expect(mapped).toMatchObject({
      code: "RUN_MANIFEST_IMMUTABLE",
      status: 409,
      retryable: false,
      correlationId: "corr-2",
    });
  });

  it("does not map manifest mismatch name without sentinel message", () => {
    const error = new Error("generic mismatch");
    error.name = "RunManifestMismatchError";

    const mapped = mapRunExecutionErrorToDomain(error, "corr-3");

    expect(mapped).toBeNull();
  });

  it("returns null for unrelated errors", () => {
    const mapped = mapRunExecutionErrorToDomain(
      new Error("unknown failure"),
      "corr-4",
    );

    expect(mapped).toBeNull();
  });

  it("maps planning schema mismatch errors to typed validation failure", () => {
    const mapped = mapRunExecutionErrorToDomain(
      new Error("No object generated: response did not match schema."),
      "corr-5",
    );

    expect(mapped).toMatchObject({
      code: "PLAN_SCHEMA_MISMATCH",
      status: 422,
      retryable: false,
      correlationId: "corr-5",
    });
  });

  it("maps planning timeout errors to typed retryable timeout", () => {
    const timeoutError = new Error(
      "[llm/gateway] structured call timed out after 45000ms (phase=planning)",
    );
    timeoutError.name = "LLMTimeoutError";

    const mapped = mapRunExecutionErrorToDomain(timeoutError, "corr-6");

    expect(mapped).toMatchObject({
      code: "PLAN_GENERATION_TIMEOUT",
      status: 504,
      retryable: true,
      correlationId: "corr-6",
    });
  });
});
