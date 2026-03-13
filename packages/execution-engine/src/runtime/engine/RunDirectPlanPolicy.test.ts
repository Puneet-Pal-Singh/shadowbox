import { describe, expect, it } from "vitest";
import { buildDirectExecutionPlan } from "./RunDirectPlanPolicy.js";

describe("RunDirectPlanPolicy", () => {
  it("builds a direct read_file task for obvious file reads", () => {
    const plan = buildDirectExecutionPlan("read README.md");

    expect(plan).toMatchObject({
      tasks: [
        {
          type: "read_file",
          input: { path: "README.md" },
        },
      ],
      metadata: { estimatedSteps: 1 },
    });
  });

  it("builds a direct run_command task for raw executable commands", () => {
    const plan = buildDirectExecutionPlan("pnpm test -- src/runtime/engine");

    expect(plan).toMatchObject({
      tasks: [
        {
          type: "run_command",
          input: { command: "pnpm test -- src/runtime/engine" },
        },
      ],
    });
  });

  it("builds a direct write_file task when explicit code-block content is provided", () => {
    const plan = buildDirectExecutionPlan(
      "write README.md\n```md\n# Shadowbox\n```",
    );

    expect(plan).toMatchObject({
      tasks: [
        {
          type: "write_file",
          input: { path: "README.md", content: "# Shadowbox" },
        },
      ],
    });
  });

  it("returns null for ambiguous multi-step edit requests", () => {
    const plan = buildDirectExecutionPlan(
      "edit src/foo.ts to fix the bug and then run tests",
    );

    expect(plan).toBeNull();
  });
});
