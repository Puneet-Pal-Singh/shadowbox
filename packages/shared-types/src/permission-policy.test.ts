import { describe, expect, it } from "vitest";
import {
  APPROVAL_POLICIES,
  EXECUTION_SCOPES,
  PERMISSION_RUNTIME_LABELS,
  PRODUCT_MODES,
  WORKFLOW_ENTRYPOINTS,
  WORKFLOW_INTENTS,
  createEffectivePermissionState,
  derivePermissionLabel,
  mapProductModeToPermissionTuple,
  resolveWorkflowIntent,
} from "./permission-policy.js";

describe("permission policy runtime model", () => {
  it("maps product modes to deterministic runtime tuples", () => {
    expect(mapProductModeToPermissionTuple(PRODUCT_MODES.ASK_ALWAYS)).toEqual({
      approvalPolicy: APPROVAL_POLICIES.RESTRICTED,
      executionScope: EXECUTION_SCOPES.WORKSPACE_SAFE,
    });
    expect(
      mapProductModeToPermissionTuple(PRODUCT_MODES.AUTO_FOR_SAFE),
    ).toEqual({
      approvalPolicy: APPROVAL_POLICIES.ASK_ON_REQUEST,
      executionScope: EXECUTION_SCOPES.WORKSPACE_SAFE,
    });
    expect(
      mapProductModeToPermissionTuple(PRODUCT_MODES.AUTO_FOR_SAME_REPO),
    ).toEqual({
      approvalPolicy: APPROVAL_POLICIES.ASK_ON_REQUEST,
      executionScope: EXECUTION_SCOPES.WORKSPACE_MUTATION,
    });
    expect(mapProductModeToPermissionTuple(PRODUCT_MODES.FULL_AGENT)).toEqual({
      approvalPolicy: APPROVAL_POLICIES.HIGH_TRUST,
      executionScope: EXECUTION_SCOPES.WORKSPACE_HIGH_TRUST,
    });
  });

  it("resolves workflow intent deterministically without prompt text", () => {
    expect(
      resolveWorkflowIntent({
        runMode: "build",
        explicitIntent: WORKFLOW_INTENTS.EXPLORE,
        entrypoint: WORKFLOW_ENTRYPOINTS.DEPLOY_ACTION,
      }),
    ).toBe(WORKFLOW_INTENTS.EXPLORE);

    expect(
      resolveWorkflowIntent({
        runMode: "build",
        entrypoint: WORKFLOW_ENTRYPOINTS.REVIEW_ACTION,
      }),
    ).toBe(WORKFLOW_INTENTS.REVIEW);

    expect(
      resolveWorkflowIntent({
        runMode: "plan",
      }),
    ).toBe(WORKFLOW_INTENTS.REVIEW);
  });

  it("derives canonical labels from tuple state", () => {
    const defaultState = createEffectivePermissionState({
      productMode: PRODUCT_MODES.AUTO_FOR_SAFE,
      workflowIntent: WORKFLOW_INTENTS.BUILD,
    });
    expect(derivePermissionLabel(defaultState)).toBe(
      PERMISSION_RUNTIME_LABELS.DEFAULT,
    );

    const fullAccessState = createEffectivePermissionState({
      productMode: PRODUCT_MODES.FULL_AGENT,
      workflowIntent: WORKFLOW_INTENTS.SHIP,
    });
    expect(derivePermissionLabel(fullAccessState)).toBe(
      PERMISSION_RUNTIME_LABELS.FULL_ACCESS,
    );

    const customState = {
      ...defaultState,
      executionScope: EXECUTION_SCOPES.WORKSPACE_MUTATION,
    };
    expect(derivePermissionLabel(customState)).toBe(
      PERMISSION_RUNTIME_LABELS.CUSTOM,
    );
  });
});
