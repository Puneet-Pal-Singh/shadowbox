import { describe, expect, it } from "vitest";
import { classifyRetryability } from "./RetryClassifier.js";

describe("RetryClassifier", () => {
  it("marks deterministic invalid-target messages as non-retryable", () => {
    const ambiguous = classifyRetryability(
      'Target "this file" is ambiguous. Running discovery first.',
    );
    expect(ambiguous.retryable).toBe(false);
    expect(ambiguous.reasonCode).toBe("DETERMINISTIC_INVALID_TARGET");

    const noGlobMatches = classifyRetryability(
      'No files matched glob pattern "**/*.ts" from .',
    );
    expect(noGlobMatches.retryable).toBe(false);
    expect(noGlobMatches.reasonCode).toBe("DETERMINISTIC_INVALID_TARGET");
  });

  it("keeps unknown transient errors retryable", () => {
    const transient = classifyRetryability("network timeout while calling sandbox");
    expect(transient.retryable).toBe(true);
    expect(transient.reasonCode).toBe("TRANSIENT_OR_UNKNOWN");
  });
});
