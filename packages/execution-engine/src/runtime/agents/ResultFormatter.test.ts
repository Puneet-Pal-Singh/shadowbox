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

  it("redacts internal sandbox run paths from task output", () => {
    const result = {
      message:
        "cat: /home/sandbox/runs/4ccbe9ee-6201-4d9b-8377-dbae1e386894/README.md: No such file or directory",
    };

    const formatted = formatExecutionResult(result);
    expect(formatted).not.toContain(
      "/home/sandbox/runs/4ccbe9ee-6201-4d9b-8377-dbae1e386894/",
    );
    expect(formatted).toContain("/home/sandbox/runs/[run]/");
  });
});
