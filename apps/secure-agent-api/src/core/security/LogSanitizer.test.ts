import { describe, expect, it } from "vitest";
import {
  sanitizeLogText,
  sanitizePayload,
  sanitizeUnknownError,
} from "./LogSanitizer";

describe("secure-agent-api log sanitizer", () => {
  it("redacts sensitive payload keys", () => {
    const sanitized = sanitizePayload({
      token: "ghp_secret123",
      options: {
        authorization: "Bearer abc",
        path: "./safe",
      },
    });

    expect(sanitized.token).toBe("[REDACTED]");
    expect((sanitized.options as { authorization: string }).authorization).toBe(
      "[REDACTED]",
    );
  });

  it("redacts token patterns in text", () => {
    const value = "Authorization Bearer token123 ghp_superSecret12345";
    const sanitized = sanitizeLogText(value);
    expect(sanitized).toContain("[REDACTED]");
    expect(sanitized).not.toContain("token123");
    expect(sanitized).not.toContain("ghp_superSecret12345");
  });

  it("redacts provider API key patterns", () => {
    const value =
      "sk-live-abcdefghijklmnopqrstuvwxyz1234 gsk_abcdefghijklmnopqrstuvwxyz1234 AIzaSyA1234567890abcdefghijklmnopqrstuvwxyz xai-abcdefghijklmnopqrstuvwxyz1234";
    const sanitized = sanitizeLogText(value);

    expect(sanitized).toContain("[REDACTED]");
    expect(sanitized).not.toContain("sk-live-abcdefghijklmnopqrstuvwxyz1234");
    expect(sanitized).not.toContain("gsk_abcdefghijklmnopqrstuvwxyz1234");
    expect(sanitized).not.toContain(
      "AIzaSyA1234567890abcdefghijklmnopqrstuvwxyz",
    );
    expect(sanitized).not.toContain("xai-abcdefghijklmnopqrstuvwxyz1234");
  });

  it("sanitizes unknown errors", () => {
    const error = new Error("bad credentials: Basic dXNlcjpwYXNz");
    expect(sanitizeUnknownError(error)).toContain("[REDACTED]");
  });
});
