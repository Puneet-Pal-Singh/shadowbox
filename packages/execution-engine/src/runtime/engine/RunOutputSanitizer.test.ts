import { describe, expect, it } from "vitest";
import { sanitizeUserFacingOutput } from "./RunOutputSanitizer.js";

describe("RunOutputSanitizer", () => {
  it("strips leaked internal planning prefaces while preserving user-facing text", () => {
    const output = sanitizeUserFacingOutput(
      "I need to check PR #58 status first. CI checks are green and ready for merge.",
    );

    expect(output).toBe("CI checks are green and ready for merge.");
  });

  it("keeps legitimate user-facing responses that start with 'I need to' but are not planning chatter", () => {
    const output = sanitizeUserFacingOutput(
      "I need to confirm one detail before I proceed: which branch should I target?",
    );

    expect(output).toBe(
      "I need to confirm one detail before I proceed: which branch should I target?",
    );
  });
});
