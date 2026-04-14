import type { ApprovalDecision } from "@repo/shared-types";
import type { RunInput } from "../types.js";
import type { PermissionDecisionResult } from "./PermissionApprovalStore.js";

export function extractApprovalDecision(input: RunInput): ApprovalDecision | null {
  const metadata = input.metadata;
  if (!metadata) {
    return null;
  }
  const raw = metadata.permissionDecision;
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const kind = record.kind;
  const requestId = record.requestId;
  if (typeof kind !== "string" || typeof requestId !== "string") {
    return null;
  }
  if (
    kind !== "allow_once" &&
    kind !== "allow_for_run" &&
    kind !== "allow_persistent_rule" &&
    kind !== "deny" &&
    kind !== "abort"
  ) {
    return null;
  }
  if (!requestId.trim()) {
    return null;
  }
  return {
    kind,
    requestId,
  };
}

export function buildApprovalDecisionMessage(
  decisionResult: PermissionDecisionResult,
): string {
  if (decisionResult.status === "approved") {
    if (decisionResult.decision === "allow_once") {
      return "Approval recorded. I can run that exact action once on your next request.";
    }
    if (decisionResult.decision === "allow_for_run") {
      return "Approval recorded for this run. I can continue this action during the current run scope.";
    }
    if (decisionResult.decision === "allow_persistent_rule") {
      return "Persistent narrow rule recorded. Future matching actions can run without asking when the policy allows it.";
    }
  }
  if (decisionResult.status === "aborted") {
    return "Approval request aborted. Shadowbox will stop this risky action path until you issue a new instruction.";
  }
  return "Approval denied. Shadowbox will keep this risky action blocked.";
}
