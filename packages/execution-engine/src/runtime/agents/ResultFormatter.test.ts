import { describe, expect, it } from "vitest";
import { formatExecutionResult, formatTaskOutput } from "./ResultFormatter.js";

describe("ResultFormatter", () => {
  it("extracts content text from nested execution payloads", () => {
    const result = {
      success: true,
      data: {
        content: "README contents",
      },
    };

    expect(formatExecutionResult(result)).toBe("README contents");
  });

  it("serializes unknown object payloads as JSON", () => {
    const result = {
      success: true,
      files: ["README.md"],
    };

    expect(formatExecutionResult(result)).toContain('"success": true');
    expect(formatExecutionResult(result)).toContain('"README.md"');
  });

  it("returns friendly fallback when task output is empty", () => {
    expect(formatTaskOutput(undefined)).toBe("no output");
  });
});
