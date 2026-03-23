import { describe, expect, it } from "vitest";
import {
  buildAgenticLoopFinalOutput,
  recordAgenticLoopMetadata,
} from "./RunAgenticLoopPolicy.js";
import { Run } from "../run/index.js";
import type { AgenticLoopResult } from "./AgenticLoop.js";

describe("RunAgenticLoopPolicy", () => {
  it("prefers assistant synthesis when the loop ends normally", () => {
    const result: AgenticLoopResult = {
      stopReason: "llm_stop",
      messages: [
        { role: "user", content: "inspect the file" },
        {
          role: "assistant",
          content: "The file contains the expected export.",
        },
      ],
      toolExecutionCount: 1,
      failedToolCount: 0,
      stepsExecuted: 2,
      toolLifecycle: [
        {
          toolCallId: "tool-1",
          toolName: "read_file",
          status: "completed",
          mutating: false,
          recordedAt: new Date().toISOString(),
          detail: "export const value = 1;",
        },
      ],
    };

    expect(buildAgenticLoopFinalOutput(result)).toBe(
      "The file contains the expected export.",
    );
  });

  it("builds a truthful fallback summary when the loop stops on tool failure", () => {
    const result: AgenticLoopResult = {
      stopReason: "tool_error",
      messages: [
        { role: "user", content: "update the file" },
        { role: "assistant", content: "I'll update the file now." },
      ],
      toolExecutionCount: 2,
      failedToolCount: 1,
      stepsExecuted: 1,
      toolLifecycle: [
        {
          toolCallId: "tool-1",
          toolName: "read_file",
          status: "completed",
          mutating: false,
          recordedAt: new Date().toISOString(),
          detail: "README contents",
        },
        {
          toolCallId: "tool-2",
          toolName: "write_file",
          status: "failed",
          mutating: true,
          recordedAt: new Date().toISOString(),
          detail: "Permission denied",
        },
      ],
    };

    const output = buildAgenticLoopFinalOutput(result);

    expect(output).toContain("The build loop stopped after a tool failure.");
    expect(output).toContain("Completed: read_file (tool-1): README contents");
    expect(output).toContain(
      "Failures: write_file (tool-2): Permission denied",
    );
    expect(output).not.toContain("I'll update the file now.");
  });

  it("records tool lifecycle snapshots in run metadata", () => {
    const run = new Run("run-1", "session-1", "RUNNING", "coding", {
      agentType: "coding",
      prompt: "inspect repository",
      sessionId: "session-1",
    });
    const result: AgenticLoopResult = {
      stopReason: "llm_stop",
      messages: [{ role: "assistant", content: "done" }],
      toolExecutionCount: 1,
      failedToolCount: 0,
      stepsExecuted: 2,
      toolLifecycle: [
        {
          toolCallId: "tool-1",
          toolName: "read_file",
          status: "requested",
          mutating: false,
          recordedAt: new Date().toISOString(),
        },
        {
          toolCallId: "tool-1",
          toolName: "read_file",
          status: "started",
          mutating: false,
          recordedAt: new Date().toISOString(),
        },
        {
          toolCallId: "tool-1",
          toolName: "read_file",
          status: "completed",
          mutating: false,
          recordedAt: new Date().toISOString(),
          detail: "package.json",
        },
      ],
    };

    recordAgenticLoopMetadata(run, result);

    expect(run.metadata.agenticLoop?.toolLifecycle).toEqual(
      result.toolLifecycle,
    );
  });
});
