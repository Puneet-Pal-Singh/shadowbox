import { isGoldenFlowToolName } from "../contracts/CodingToolGateway.js";
import { executeAgenticLoopTool } from "./AgenticLoopToolExecutor.js";
import { AgenticLoopCancelledError } from "./AgenticLoop.js";
import { getToolPresentation } from "../lib/ToolPresentation.js";
import type { Run } from "../run/index.js";
import type { RunRepository } from "../run/index.js";
import type { RuntimeExecutionService, TaskResult } from "../types.js";
import type { RunEventRecorder } from "../events/index.js";
import type { PermissionApprovalStore } from "./PermissionApprovalStore.js";
import { resolveRunPermissionContext } from "./RunPermissionContextPolicy.js";
import { evaluateToolPermission } from "./RunRiskyActionPolicy.js";
import { PermissionGateError } from "./PermissionGateError.js";
import {
  ensureApprovalResolvedEventRecorded,
  waitForApprovalDecision,
} from "./RunApprovalWaitPolicy.js";
import type { RunEngineEnv } from "./RunEngineTypes.js";
import {
  recordLifecycleStep,
} from "./RunMetadataPolicy.js";

interface AgenticLoopToolCall {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
}

interface AgenticLoopCallbacks {
  executeTool?: (toolCall: AgenticLoopToolCall) => Promise<TaskResult>;
  onToolRequested: (toolCall: AgenticLoopToolCall) => Promise<void>;
  onToolStarted: (toolCall: AgenticLoopToolCall) => Promise<void>;
  onToolCompleted: (
    toolCall: AgenticLoopToolCall,
    result: unknown,
    executionTimeMs: number,
  ) => Promise<void>;
  onToolFailed: (
    toolCall: AgenticLoopToolCall,
    error: string,
    executionTimeMs: number,
  ) => Promise<void>;
}

export function buildAgenticLoopCallbacks(input: {
  run: Run;
  directExecutionService?: RuntimeExecutionService;
  runEventRecorder: RunEventRecorder;
  permissionApprovalStore: PermissionApprovalStore;
  runRepo: RunRepository;
  env: RunEngineEnv;
  runId: string;
}): AgenticLoopCallbacks {
  let hasMutationEvidence = false;
  return {
    executeTool: input.directExecutionService
      ? async (toolCall) =>
          executeDirectToolCall({
            run: input.run,
            toolCall,
            directExecutionService: input.directExecutionService!,
            runEventRecorder: input.runEventRecorder,
            permissionApprovalStore: input.permissionApprovalStore,
            runRepo: input.runRepo,
            env: input.env,
            runId: input.runId,
            hasMutationEvidence,
            setHasMutationEvidence: (value) => {
              hasMutationEvidence = value;
            },
          })
      : undefined,
    onToolRequested: async (toolCall) => {
      const toolPresentation = getToolPresentation(
        toolCall.toolName,
        toolCall.args,
      );
      await input.runEventRecorder.recordToolRequested({
        id: toolCall.id,
        type: toolCall.toolName,
        input: {
          ...toolCall.args,
          description: toolPresentation.description,
          displayText: toolPresentation.displayText,
        },
      });
    },
    onToolStarted: async (toolCall) => {
      await input.runEventRecorder.recordToolStarted({
        id: toolCall.id,
        type: toolCall.toolName,
      });
    },
    onToolCompleted: async (toolCall, result, executionTimeMs) => {
      if (toolCall.toolName === "write_file") {
        hasMutationEvidence = true;
      }
      await input.runEventRecorder.recordToolCompleted(
        {
          id: toolCall.id,
          type: toolCall.toolName,
        },
        result,
        executionTimeMs,
      );
    },
    onToolFailed: async (toolCall, error, executionTimeMs) => {
      await input.runEventRecorder.recordToolFailed(
        {
          id: toolCall.id,
          type: toolCall.toolName,
        },
        error,
        executionTimeMs,
      );
    },
  };
}

async function executeDirectToolCall(input: {
  run: Run;
  toolCall: AgenticLoopToolCall;
  directExecutionService: RuntimeExecutionService;
  runEventRecorder: RunEventRecorder;
  permissionApprovalStore: PermissionApprovalStore;
  runRepo: RunRepository;
  env: RunEngineEnv;
  runId: string;
  hasMutationEvidence: boolean;
  setHasMutationEvidence: (value: boolean) => void;
}): Promise<TaskResult> {
  const toolPresentation = getToolPresentation(
    input.toolCall.toolName,
    input.toolCall.args,
  );
  if (!isGoldenFlowToolName(input.toolCall.toolName)) {
    throw new Error(
      `Unsupported direct agentic tool: ${input.toolCall.toolName}`,
    );
  }

  const permissionState =
    input.run.metadata.permissionContext?.state ??
    resolveRunPermissionContext(input.run.input).state;
  const permissionResult = await evaluateToolPermission({
    runId: input.run.id,
    sessionId: input.run.sessionId,
    origin: "agent",
    productMode: permissionState.productMode,
    workflowIntent: permissionState.workflowIntent,
    toolName: input.toolCall.toolName,
    toolArgs: input.toolCall.args,
    hasMutationEvidence: input.hasMutationEvidence,
    approvalStore: input.permissionApprovalStore,
  });
  if (permissionResult.kind === "ask") {
    recordLifecycleStep(
      input.run,
      "APPROVAL_WAIT",
      "structured approval request emitted",
    );
    await input.runEventRecorder.recordApprovalRequested(permissionResult.request);
    const approvalOutcome = await waitForApprovalDecision({
      request: permissionResult.request,
      env: input.env,
      runId: input.runId,
      runRepo: input.runRepo,
      permissionApprovalStore: input.permissionApprovalStore,
    });
    if (
      approvalOutcome.outcome === "approved" ||
      approvalOutcome.outcome === "denied" ||
      approvalOutcome.outcome === "aborted"
    ) {
      await ensureApprovalResolvedEventRecorded({
        runEventRecorder: input.runEventRecorder,
        requestId: permissionResult.request.requestId,
        decision:
          approvalOutcome.decision ??
          (approvalOutcome.outcome === "approved"
            ? "allow_once"
            : approvalOutcome.outcome === "aborted"
              ? "abort"
              : "deny"),
        status:
          approvalOutcome.outcome === "approved"
            ? "approved"
            : approvalOutcome.outcome === "aborted"
              ? "aborted"
              : "denied",
      });
    }
    if (approvalOutcome.outcome === "approved") {
      // Continue with the original tool call after approval is granted.
    } else if (approvalOutcome.outcome === "timed_out") {
      throw PermissionGateError.fromAsk(permissionResult.request);
    } else if (approvalOutcome.outcome === "cancelled") {
      throw new AgenticLoopCancelledError(
        "Run was cancelled while waiting for approval.",
      );
    } else if (approvalOutcome.outcome === "aborted") {
      throw PermissionGateError.fromDeny("Approval request was aborted.");
    } else {
      throw PermissionGateError.fromDeny("Approval request was denied.");
    }
  }

  if (permissionResult.kind === "deny") {
    throw PermissionGateError.fromDeny(permissionResult.reason);
  }

  const result = await executeAgenticLoopTool(input.directExecutionService, {
    taskId: input.toolCall.id,
    toolName: input.toolCall.toolName,
    toolInput: {
      description: toolPresentation.description,
      displayText: toolPresentation.displayText,
      ...input.toolCall.args,
    },
    onOutputAppended: async (chunk) => {
      await input.runEventRecorder.recordToolOutputAppended(
        {
          id: input.toolCall.id,
          type: input.toolCall.toolName,
        },
        chunk,
      );
    },
  });
  if (input.toolCall.toolName === "write_file") {
    input.setHasMutationEvidence(true);
  }
  return result;
}
