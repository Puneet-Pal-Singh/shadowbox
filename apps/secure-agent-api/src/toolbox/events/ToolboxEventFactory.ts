import type {
  ToolboxSessionHandle,
  ToolboxSessionStatus,
} from "../contracts/ToolboxSession";

export interface ToolboxEvent {
  sessionId: string;
  runId: string;
  toolName: string;
  callId: string;
  status: ToolboxSessionStatus;
  timestamp: number;
}

export class ToolboxEventFactory {
  createRequested(handle: ToolboxSessionHandle): ToolboxEvent {
    return {
      sessionId: handle.sessionId,
      runId: handle.runId,
      toolName: handle.toolName,
      callId: handle.callId,
      status: "requested",
      timestamp: Date.now(),
    };
  }

  createStatus(
    handle: ToolboxSessionHandle,
    status: ToolboxSessionStatus,
  ): ToolboxEvent {
    return {
      sessionId: handle.sessionId,
      runId: handle.runId,
      toolName: handle.toolName,
      callId: handle.callId,
      status,
      timestamp: Date.now(),
    };
  }
}
