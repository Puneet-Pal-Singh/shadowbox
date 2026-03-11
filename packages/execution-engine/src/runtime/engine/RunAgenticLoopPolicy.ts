import type { CoreMessage, CoreTool } from "ai";
import type { Run } from "../run/index.js";
import type { AgenticLoopResult } from "./AgenticLoop.js";
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
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0 && raw <= 20) {
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
    completedAt: new Date().toISOString(),
  };
}

export function buildAgenticLoopFinalOutput(result: AgenticLoopResult): string {
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
