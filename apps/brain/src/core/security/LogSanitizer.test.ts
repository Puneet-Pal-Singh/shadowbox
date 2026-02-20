import { describe, expect, it } from "vitest";
import {
  sanitizeLogPayload,
  sanitizeLogText,
  sanitizeUnknownError,
} from "./LogSanitizer";

describe("brain log sanitizer", () => {
  it("redacts known secret fields in payloads", () => {
    const sanitized = sanitizeLogPayload({
      command: "git clone",
      token: "ghp_superSecret123",
      nested: {
        authorization: "Bearer abc123",
        safe: "value",
      },
    });

    expect(sanitized.token).toBe("[REDACTED]");
    expect((sanitized.nested as { authorization: string }).authorization).toBe(
      "[REDACTED]",
    );
  });

  it("redacts token patterns in text", () => {
    const value =
      "Authorization: Bearer xyz token=ghp_superSecret123 and Basic dXNlcjpwYXNz";
    const sanitized = sanitizeLogText(value);

    expect(sanitized).not.toContain("xyz");
    expect(sanitized).not.toContain("ghp_superSecret123");
    expect(sanitized).not.toContain("dXNlcjpwYXNz");
    expect(sanitized).toContain("[REDACTED]");
  });

  it("redacts provider key formats in text", () => {
    const value =
      "openai=sk-proj-abcdefghijklmnopqrstuvwxyz1234 groq=gsk_abcdefghijklmnopqrstuvwxyz1234 google=AIzaSyA1234567890abcdefghijklmnopqrstuvwxyz";
    const sanitized = sanitizeLogText(value);

    expect(sanitized).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz1234");
    expect(sanitized).not.toContain("gsk_abcdefghijklmnopqrstuvwxyz1234");
    expect(sanitized).not.toContain(
      "AIzaSyA1234567890abcdefghijklmnopqrstuvwxyz",
    );
    expect(sanitized).toContain("[REDACTED]");
  });

  it("sanitizes unknown errors", () => {
    const error = new Error("failed with Bearer secretToken");
    expect(sanitizeUnknownError(error)).toContain("[REDACTED]");
  });
});
