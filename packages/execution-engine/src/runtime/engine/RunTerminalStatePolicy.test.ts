import { describe, expect, it } from "vitest";
import { RUN_TERMINAL_STATES } from "@repo/shared-types";
import { resolveLoopTerminalState } from "./RunTerminalStatePolicy.js";

describe("RunTerminalStatePolicy", () => {
  it("classifies permission-denied tool errors as failed_policy", () => {
    const terminalState = resolveLoopTerminalState({
      loopResult: {
        stopReason: "tool_error",
        messages: [],
        toolExecutionCount: 1,
        failedToolCount: 1,
        stepsExecuted: 1,
        requiresMutation: true,
        completedMutatingToolCount: 0,
        completedReadOnlyToolCount: 0,
        toolLifecycle: [],
      },
      metadata: { code: "PERMISSION_DENIED" },
    });

    expect(terminalState).toBe(RUN_TERMINAL_STATES.FAILED_POLICY);
  });
});
