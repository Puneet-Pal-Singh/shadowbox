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

  it("flags mutation requests that completed without edit evidence", () => {
    const summary = buildGroundedTaskSummary("add logging to PendingJobCard.tsx", [
      buildTask({
        id: "1",
        status: "DONE",
        description: "Read PendingJobCard.tsx",
        output: "Read src/components/PendingJobCard.tsx",
      }),
    ]);

    expect(summary.audit.requestedMutation).toBe(true);
    expect(summary.audit.completedMutatingTaskCount).toBe(0);
    expect(summary.audit.missingMutationEvidence).toBe(true);
    expect(summary.evidencePrompt).toContain(
      "do not claim a file/code change was completed unless completed mutating task evidence exists",
    );
    expect(summary.missingMutationSummary).toContain(
      "did not record any successful edit/write task",
    );
  });
});

function buildTask({
  id,
  status,
  description,
  output,
  error,
  type = "shell",
}: {
  id: string;
  status:
    | "DONE"
    | "FAILED"
    | "RUNNING";
  description: string;
  output?: string;
  error?: string;
  type?: string;
}) {
  return {
    id,
    runId: "run-1",
    type,
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
