import {
  DEFAULT_PRODUCT_MODE,
  ProductModeSchema,
  WorkflowEntrypointSchema,
  WorkflowIntentSchema,
  createEffectivePermissionState,
  derivePermissionLabel,
  resolveWorkflowIntent,
  type WorkflowIntentResolverInput,
} from "@repo/shared-types";
import type { RunInput, RunMetadata } from "../types.js";

export function resolveRunPermissionContext(
  input: RunInput,
): NonNullable<RunMetadata["permissionContext"]> {
  const metadata = toRecord(input.metadata);
  const permissionPolicy = toRecord(metadata?.permissionPolicy);
  const workflow = toRecord(metadata?.workflow);

  const productMode =
    parseProductMode(permissionPolicy?.productMode) ??
    parseProductMode(workflow?.productMode) ??
    parseProductMode(metadata?.productMode) ??
    DEFAULT_PRODUCT_MODE;

  const resolverInput: WorkflowIntentResolverInput = {
    runMode: input.mode ?? "build",
    entrypoint:
      parseWorkflowEntrypoint(permissionPolicy?.entrypoint) ??
      parseWorkflowEntrypoint(workflow?.entrypoint) ??
      parseWorkflowEntrypoint(metadata?.workflowEntrypoint),
    explicitIntent:
      parseWorkflowIntent(permissionPolicy?.intent) ??
      parseWorkflowIntent(workflow?.intent) ??
      parseWorkflowIntent(metadata?.workflowIntent),
  };

  const workflowIntent = resolveWorkflowIntent(resolverInput);
  const state = createEffectivePermissionState({
    productMode,
    workflowIntent,
  });

  return {
    state,
    label: derivePermissionLabel(state),
    resolverInput,
    resolvedAt: new Date().toISOString(),
  };
}

function parseProductMode(value: unknown) {
  const parsed = ProductModeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseWorkflowEntrypoint(value: unknown) {
  const parsed = WorkflowEntrypointSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseWorkflowIntent(value: unknown) {
  const parsed = WorkflowIntentSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function toRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
