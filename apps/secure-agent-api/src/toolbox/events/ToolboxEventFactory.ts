import type {
  ToolboxSessionHandle,
  ToolboxSessionRequest,
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
  createRequested(request: ToolboxSessionRequest): ToolboxEvent {
    return {
      sessionId: buildSessionId(request),
      runId: request.runId,
      toolName: request.toolName,
      callId: request.callId,
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

function buildSessionId(request: ToolboxSessionRequest): string {
  return `${request.runId}:${request.callId}:${request.toolName}`;
}
