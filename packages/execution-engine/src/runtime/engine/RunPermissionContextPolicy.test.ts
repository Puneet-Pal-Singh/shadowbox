import { describe, expect, it } from "vitest";
import {
  PERMISSION_RUNTIME_LABELS,
  PRODUCT_MODES,
  WORKFLOW_ENTRYPOINTS,
  WORKFLOW_INTENTS,
} from "@repo/shared-types";
import { resolveRunPermissionContext } from "./RunPermissionContextPolicy.js";
import type { RunInput } from "../types.js";

function createInput(overrides: Partial<RunInput> = {}): RunInput {
  return {
    agentType: "coding",
    prompt: "check repository health",
    sessionId: "session-1",
    ...overrides,
  };
}

describe("RunPermissionContextPolicy", () => {
  it("defaults to auto_for_safe product mode and build workflow intent", () => {
    const context = resolveRunPermissionContext(createInput());

    expect(context.state.productMode).toBe(PRODUCT_MODES.AUTO_FOR_SAFE);
    expect(context.state.workflowIntent).toBe(WORKFLOW_INTENTS.BUILD);
    expect(context.label).toBe(PERMISSION_RUNTIME_LABELS.DEFAULT);
  });

  it("uses runMode fallback for plan turns when workflow metadata is absent", () => {
    const context = resolveRunPermissionContext(
      createInput({
        mode: "plan",
      }),
    );

    expect(context.state.workflowIntent).toBe(WORKFLOW_INTENTS.REVIEW);
    expect(context.resolverInput.runMode).toBe("plan");
  });

  it("respects explicit workflow and product mode metadata", () => {
    const context = resolveRunPermissionContext(
      createInput({
        metadata: {
          permissionPolicy: {
            productMode: PRODUCT_MODES.FULL_AGENT,
            intent: WORKFLOW_INTENTS.SHIP,
          },
        },
      }),
    );

    expect(context.state.productMode).toBe(PRODUCT_MODES.FULL_AGENT);
    expect(context.state.workflowIntent).toBe(WORKFLOW_INTENTS.SHIP);
    expect(context.label).toBe(PERMISSION_RUNTIME_LABELS.FULL_ACCESS);
  });

  it("prefers explicit intent over entrypoint mapping", () => {
    const context = resolveRunPermissionContext(
      createInput({
        metadata: {
          workflow: {
            entrypoint: WORKFLOW_ENTRYPOINTS.DEPLOY_ACTION,
            intent: WORKFLOW_INTENTS.EXPLORE,
          },
        },
      }),
    );

    expect(context.state.workflowIntent).toBe(WORKFLOW_INTENTS.EXPLORE);
  });
});
