import { describe, expect, it } from "vitest";
import {
  buildAgenticLoopFinalOutput,
  getAgenticLoopMaxSteps,
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
      requiresMutation: false,
      completedMutatingToolCount: 0,
      completedReadOnlyToolCount: 1,
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

  it("extracts assistant synthesis from structured text parts", () => {
    const result: AgenticLoopResult = {
      stopReason: "llm_stop",
      messages: [
        { role: "user", content: "check git info" },
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "tool-1",
              toolName: "git_status",
              args: {},
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "tool-1",
              toolName: "git_status",
              output: { branch: "main", files: [] },
              isError: false,
            },
          ],
        },
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "You're on main and the working tree is clean.",
            },
          ],
        },
      ],
      toolExecutionCount: 1,
      failedToolCount: 0,
      stepsExecuted: 2,
      requiresMutation: false,
      completedMutatingToolCount: 0,
      completedReadOnlyToolCount: 1,
      toolLifecycle: [],
    };

    expect(buildAgenticLoopFinalOutput(result)).toBe(
      "You're on main and the working tree is clean.",
    );
  });

  it("prefers grounded edit evidence over vague assistant prose for successful mutation runs", () => {
    const result: AgenticLoopResult = {
      stopReason: "llm_stop",
      messages: [
        { role: "user", content: "make the job detail page more useful" },
        {
          role: "assistant",
          content: "Now let me enhance the value proposition sections.",
        },
      ],
      toolExecutionCount: 3,
      failedToolCount: 0,
      stepsExecuted: 4,
      requiresMutation: true,
      completedMutatingToolCount: 2,
      completedReadOnlyToolCount: 1,
      toolLifecycle: [
        {
          toolCallId: "tool-1",
          toolName: "write_file",
          status: "completed",
          mutating: true,
          recordedAt: new Date().toISOString(),
          detail: "updated src/components/jobs/JobDetailView.tsx",
          metadata: {
            family: "edit",
            filePath: "src/components/jobs/JobDetailView.tsx",
            additions: 18,
            deletions: 6,
          },
        },
        {
          toolCallId: "tool-2",
          toolName: "write_file",
          status: "completed",
          mutating: true,
          recordedAt: new Date().toISOString(),
          detail: "updated src/components/jobs/job-detail/JobSidebar.tsx",
          metadata: {
            family: "edit",
            filePath: "src/components/jobs/job-detail/JobSidebar.tsx",
            additions: 12,
            deletions: 4,
          },
        },
      ],
    };

    const output = buildAgenticLoopFinalOutput(result);

    expect(output).toContain(
      "I completed the requested update and changed 2 files:",
    );
    expect(output).toContain("src/components/jobs/JobDetailView.tsx (+18 -6)");
    expect(output).toContain(
      "src/components/jobs/job-detail/JobSidebar.tsx (+12 -4)",
    );
    expect(output).toContain(
      "Updated sections/components: JobDetailView, JobSidebar",
    );
    expect(output).not.toContain(
      "Now let me enhance the value proposition sections.",
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
      requiresMutation: true,
      completedMutatingToolCount: 0,
      completedReadOnlyToolCount: 1,
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

    expect(output).toContain(
      "I inspected the workspace, but I did not complete the requested change because no mutating tool succeeded.",
    );
    expect(output).toContain(
      "I checked 1 read-only tool action(s): read_file (tool-1): README contents",
    );
    expect(output).toContain(
      "The run hit 1 failure(s): write_file (tool-2): Permission denied",
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
      requiresMutation: false,
      completedMutatingToolCount: 0,
      completedReadOnlyToolCount: 1,
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
    expect(run.metadata.agenticLoop?.requiresMutation).toBe(false);
    expect(run.metadata.agenticLoop?.completedReadOnlyToolCount).toBe(1);
  });

  it("raises the default max steps to support repo discovery flows", () => {
    expect(getAgenticLoopMaxSteps()).toBe(25);
  });

  it("does not trust a read-only stop as completion for edit requests", () => {
    const result: AgenticLoopResult = {
      stopReason: "llm_stop",
      messages: [
        {
          role: "assistant",
          content: "Done! I updated the landing page.",
        },
      ],
      toolExecutionCount: 4,
      failedToolCount: 0,
      stepsExecuted: 5,
      requiresMutation: true,
      completedMutatingToolCount: 0,
      completedReadOnlyToolCount: 4,
      toolLifecycle: [
        {
          toolCallId: "tool-1",
          toolName: "read_file",
          status: "completed",
          mutating: false,
          recordedAt: new Date().toISOString(),
          detail: "hero component",
        },
      ],
    };

    const output = buildAgenticLoopFinalOutput(result);

    expect(output).toContain(
      "I inspected the workspace, but I did not complete the requested change because no mutating tool succeeded.",
    );
    expect(output).toContain(
      "No file changed in this run. Retry with a more specific target file, component, or edit instruction so I can attempt the mutation again.",
    );
    expect(output).not.toContain("Done! I updated the landing page.");
  });

  it("ignores raw standalone tool-call markup when extracting assistant text", () => {
    const result: AgenticLoopResult = {
      stopReason: "llm_stop",
      messages: [
        { role: "user", content: "check file" },
        {
          role: "assistant",
          content:
            '<tool_call>{"name":"read_file","arguments":{"path":"README.md"}}</tool_call>',
        },
      ],
      toolExecutionCount: 0,
      failedToolCount: 0,
      stepsExecuted: 1,
      requiresMutation: false,
      completedMutatingToolCount: 0,
      completedReadOnlyToolCount: 0,
      toolLifecycle: [],
    };

    const output = buildAgenticLoopFinalOutput(result);

    expect(output).toContain(
      "Agentic loop completed without assistant synthesis output.",
    );
    expect(output).not.toContain("<tool_call>");
  });
});
