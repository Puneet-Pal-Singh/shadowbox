import { describe, expect, it } from "vitest";
import { buildGroundedTaskSummary } from "./RunGroundedSummary.js";

describe("RunGroundedSummary", () => {
  it("builds explicit completed, failed, and pending sections", () => {
    const summary = buildGroundedTaskSummary("fix README and run tests", [
      buildTask({
        id: "1",
        status: "DONE",
        description: "Update README",
        output: "README updated successfully",
      }),
      buildTask({
        id: "2",
        status: "FAILED",
        description: "Run tests",
        error: "pnpm test exited with code 1",
      }),
      buildTask({
        id: "3",
        status: "RUNNING",
        description: "Check git diff",
      }),
    ]);

    expect(summary.evidencePrompt).toContain("Completed:");
    expect(summary.evidencePrompt).toContain("Failed:");
    expect(summary.evidencePrompt).toContain("Pending:");
    expect(summary.evidencePrompt).toContain(
      "do not claim work is complete if Failed or Pending sections are non-empty",
    );
    expect(summary.fallbackSummary).toContain("Request: fix README and run tests");
    expect(summary.fallbackSummary).not.toContain("Completed 2/3 tasks");
  });
});

function buildTask({
  id,
  status,
  description,
  output,
  error,
}: {
  id: string;
  status:
    | "DONE"
    | "FAILED"
    | "RUNNING";
  description: string;
  output?: string;
  error?: string;
}) {
  return {
    id,
    runId: "run-1",
    type: "shell",
    status,
    dependencies: [],
    input: {
      description,
    },
    output: output
      ? {
          content: output,
        }
      : undefined,
    error: error
      ? {
          message: error,
        }
      : undefined,
    retryCount: 0,
    maxRetries: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
