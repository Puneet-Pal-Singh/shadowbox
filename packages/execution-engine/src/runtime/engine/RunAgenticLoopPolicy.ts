import type { CoreMessage, CoreTool } from "ai";
import { z } from "zod";
import type { Run } from "../run/index.js";
import type { AgenticLoopResult } from "./AgenticLoop.js";

const AGENTIC_LOOP_DEFAULT_MAX_STEPS = 6;

const AGENTIC_TOOL_SCHEMA = {
  analyze: z.object({
    path: z.string().min(1).max(500),
  }),
  edit: z.object({
    path: z.string().min(1).max(500),
    content: z.string().min(1),
  }),
  test: z.object({
    command: z.string().min(1).max(500),
  }),
  shell: z.object({
    command: z.string().min(1).max(500),
  }),
  git: z.object({
    action: z.string().min(1).max(120),
    message: z.string().max(500).optional(),
  }),
  review: z.object({
    notes: z.string().max(2000).optional(),
  }),
} as const;

export function resolveAgenticLoopTools(
  metadata: Record<string, unknown> | undefined,
  incomingTools: Record<string, CoreTool>,
): Record<string, CoreTool> | null {
  if (!isAgenticLoopEnabled(metadata)) {
    return null;
  }

  if (Object.keys(incomingTools).length > 0) {
    return incomingTools;
  }

  return buildDefaultAgenticLoopTools();
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

function buildDefaultAgenticLoopTools(): Record<string, CoreTool> {
  return {
    analyze: {
      description: "Read and inspect an existing file path.",
      parameters: AGENTIC_TOOL_SCHEMA.analyze,
    } as unknown as CoreTool,
    edit: {
      description: "Write content to a file path.",
      parameters: AGENTIC_TOOL_SCHEMA.edit,
    } as unknown as CoreTool,
    test: {
      description: "Run a test command.",
      parameters: AGENTIC_TOOL_SCHEMA.test,
    } as unknown as CoreTool,
    shell: {
      description: "Run a non-git shell command.",
      parameters: AGENTIC_TOOL_SCHEMA.shell,
    } as unknown as CoreTool,
    git: {
      description: "Execute a structured git action.",
      parameters: AGENTIC_TOOL_SCHEMA.git,
    } as unknown as CoreTool,
    review: {
      description: "Run a focused review step.",
      parameters: AGENTIC_TOOL_SCHEMA.review,
    } as unknown as CoreTool,
  };
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
