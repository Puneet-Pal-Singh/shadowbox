import type {
  ApprovalRequest,
  PermissionEvaluationResult,
} from "@repo/shared-types";

type BlockingPermissionResult = Extract<
  PermissionEvaluationResult,
  { kind: "ask" | "deny" }
>;

export class PermissionGateError extends Error {
  readonly gateResult: BlockingPermissionResult;

  constructor(gateResult: BlockingPermissionResult, message: string) {
    super(message);
    this.name = "PermissionGateError";
    this.gateResult = gateResult;
  }

  static fromAsk(request: ApprovalRequest): PermissionGateError {
    const messageLines = [
      request.title,
      request.reason,
      "Choose an approval action to continue.",
    ];
    return new PermissionGateError(
      { kind: "ask", request },
      messageLines.join("\n"),
    );
  }

  static fromDeny(reason: string): PermissionGateError {
    return new PermissionGateError(
      { kind: "deny", reason },
      reason,
    );
  }
}
