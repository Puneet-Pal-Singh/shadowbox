import { RUN_EVENT_TYPES, type RunEvent } from "@repo/shared-types";
import type { RunStatus } from "../types.js";

export interface RunEventSummary {
  runId: string;
  status: RunStatus | null;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  runningTasks: number;
  pendingTasks: number;
  cancelledTasks: number;
  eventCount: number;
  lastEventType: RunEvent["type"] | null;
}

type ProjectedToolState = "requested" | "started" | "completed" | "failed";

export function projectRunSummaryFromEvents(
  runId: string,
  runStatus: RunStatus | null,
  events: RunEvent[],
): RunEventSummary {
  const toolStates = new Map<string, ProjectedToolState>();

  for (const event of events) {
    switch (event.type) {
      case RUN_EVENT_TYPES.TOOL_REQUESTED:
        toolStates.set(event.payload.toolId, "requested");
        break;
      case RUN_EVENT_TYPES.TOOL_STARTED:
        toolStates.set(event.payload.toolId, "started");
        break;
      case RUN_EVENT_TYPES.TOOL_COMPLETED:
        toolStates.set(event.payload.toolId, "completed");
        break;
      case RUN_EVENT_TYPES.TOOL_FAILED:
        toolStates.set(event.payload.toolId, "failed");
        break;
      default:
        break;
    }
  }

  let completedTasks = 0;
  let failedTasks = 0;
  let runningTasks = 0;
  let pendingTasks = 0;
  let cancelledTasks = 0;
  const treatPendingAsCancelled = runStatus === "CANCELLED";
  for (const state of toolStates.values()) {
    if (state === "completed") {
      completedTasks += 1;
      continue;
    }
    if (state === "failed") {
      failedTasks += 1;
      continue;
    }
    if (state === "started") {
      if (treatPendingAsCancelled) {
        cancelledTasks += 1;
        continue;
      }
      runningTasks += 1;
      continue;
    }
    if (treatPendingAsCancelled) {
      cancelledTasks += 1;
      continue;
    }
    pendingTasks += 1;
  }

  return {
    runId,
    status: runStatus,
    totalTasks: toolStates.size,
    completedTasks,
    failedTasks,
    runningTasks,
    pendingTasks,
    cancelledTasks,
    eventCount: events.length,
    lastEventType: events.at(-1)?.type ?? null,
  };
}
