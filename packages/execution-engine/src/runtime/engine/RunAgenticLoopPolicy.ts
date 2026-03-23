import type { CoreMessage, CoreTool } from "ai";
import type { Run } from "../run/index.js";
import type { AgenticLoopResult } from "./AgenticLoop.js";
import type { AgenticLoopToolLifecycleEvent } from "../types.js";
import { enforceGoldenFlowToolFloor } from "../contracts/CodingToolGateway.js";

const AGENTIC_LOOP_DEFAULT_MAX_STEPS = 6;

export function resolveAgenticLoopTools(
  metadata: Record<string, unknown> | undefined,
  incomingTools: Record<string, CoreTool>,
): Record<string, CoreTool> | null {
  if (!isAgenticLoopEnabled(metadata)) {
    return null;
  }

  return enforceGoldenFlowToolFloor(incomingTools);
}

export function getAgenticLoopMaxSteps(
  metadata?: Record<string, unknown>,
): number {
  const featureFlags = metadata?.featureFlags;
  if (typeof featureFlags !== "object" || featureFlags === null) {
    return AGENTIC_LOOP_DEFAULT_MAX_STEPS;
  }

  const raw = (featureFlags as Record<string, unknown>).agenticLoopMaxSteps;
  if (
    typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw > 0 &&
    raw <= 20
  ) {
    return raw;
  }

  return AGENTIC_LOOP_DEFAULT_MAX_STEPS;
}

export function recordAgenticLoopMetadata(
  run: Run,
  result: AgenticLoopResult,
): void {
  run.metadata.agenticLoop = {
    enabled: true,
    stopReason: result.stopReason,
    stepsExecuted: result.stepsExecuted,
    toolExecutionCount: result.toolExecutionCount,
    failedToolCount: result.failedToolCount,
    toolLifecycle: result.toolLifecycle,
    completedAt: new Date().toISOString(),
  };
}

export function buildAgenticLoopFinalOutput(result: AgenticLoopResult): string {
  if (result.stopReason !== "llm_stop") {
    return buildFallbackLoopSummary(result);
  }

  const assistantText = getLastAssistantText(result.messages);
  if (assistantText) {
    return assistantText;
  }

  return [
    "Agentic loop completed without assistant synthesis output.",
    `Stop reason: ${result.stopReason}`,
    `Steps executed: ${result.stepsExecuted}`,
    `Tools executed: ${result.toolExecutionCount}`,
    `Failed tools: ${result.failedToolCount}`,
  ].join("\n");
}

function buildFallbackLoopSummary(result: AgenticLoopResult): string {
  const completedTools = getLatestToolLifecycle(
    result.toolLifecycle,
    "completed",
  );
  const failedTools = getLatestToolLifecycle(result.toolLifecycle, "failed");
  const lines = [
    describeLoopStopReason(result.stopReason),
    `Steps executed: ${result.stepsExecuted}`,
    `Tools executed: ${result.toolExecutionCount}`,
    `Failed tools: ${result.failedToolCount}`,
  ];

  if (completedTools.length > 0) {
    lines.push(
      `Completed: ${completedTools.map(formatLifecycleSummary).join("; ")}`,
    );
  }

  if (failedTools.length > 0) {
    lines.push(
      `Failures: ${failedTools.map(formatLifecycleSummary).join("; ")}`,
    );
  }

  return lines.join("\n");
}

function isAgenticLoopEnabled(metadata?: Record<string, unknown>): boolean {
  if (!metadata) {
    return false;
  }

  const directFlag = metadata.agenticLoopV1;
  if (typeof directFlag === "boolean") {
    return directFlag;
  }

  const featureFlags = metadata.featureFlags;
  if (typeof featureFlags !== "object" || featureFlags === null) {
    return false;
  }

  const nestedFlag = (featureFlags as Record<string, unknown>).agenticLoopV1;
  return typeof nestedFlag === "boolean" ? nestedFlag : false;
}

function getLastAssistantText(messages: CoreMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message || message.role !== "assistant") {
      continue;
    }
    if (typeof message.content === "string" && message.content.trim()) {
      return message.content;
    }
  }

  return null;
}

function describeLoopStopReason(
  stopReason: AgenticLoopResult["stopReason"],
): string {
  switch (stopReason) {
    case "tool_error":
      return "The build loop stopped after a tool failure.";
    case "budget_exceeded":
      return "The build loop stopped because it hit the execution budget.";
    case "max_steps_reached":
      return "The build loop stopped after reaching the configured step limit.";
    case "cancelled":
      return "The build loop was cancelled before final synthesis.";
    case "llm_stop":
      return "The build loop completed.";
  }
}

function getLatestToolLifecycle(
  toolLifecycle: AgenticLoopToolLifecycleEvent[],
  status: AgenticLoopToolLifecycleEvent["status"],
): AgenticLoopToolLifecycleEvent[] {
  const latestByToolCall = new Map<string, AgenticLoopToolLifecycleEvent>();
  for (const event of toolLifecycle) {
    latestByToolCall.set(event.toolCallId, event);
  }

  return [...latestByToolCall.values()].filter(
    (event) => event.status === status,
  );
}

function formatLifecycleSummary(event: AgenticLoopToolLifecycleEvent): string {
  const detailSuffix = event.detail ? `: ${event.detail}` : "";
  return `${event.toolName} (${event.toolCallId})${detailSuffix}`;
}
