import { describe, expect, it } from "vitest";
import type { ToolboxCommandExecutor } from "../contracts/ToolboxSession";
import type { ToolboxEvent } from "../events/ToolboxEventFactory";
import type { ToolboxEventPublisher } from "../events/ToolboxEventPublisher";
import { ToolboxSessionService } from "../services/ToolboxSessionService";

interface ExecutorMock extends ToolboxCommandExecutor {
  execCalls: string[];
}

function createExecutorMock(
  execImpl?: (
    command: string,
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>,
): ExecutorMock {
  const execCalls: string[] = [];
  return {
    execCalls,
    execute: execImpl
      ? async (command) => {
          execCalls.push(command);
          return execImpl(command);
        }
      : async (command) => {
          execCalls.push(command);
          return { exitCode: 0, stdout: "ok", stderr: "" };
        },
  };
}

function createEventPublisherMock(): {
  events: ToolboxEvent[];
  publisher: ToolboxEventPublisher;
} {
  const events: ToolboxEvent[] = [];
  return {
    events,
    publisher: {
      publish(event) {
        events.push(event);
      },
    },
  };
}

describe("ToolboxSessionService", () => {
  it("creates a unique toolbox session per execution", async () => {
    const executor = createExecutorMock();
    const service = new ToolboxSessionService(executor);

    const first = await service.execute(
      {
        runId: "run-1",
        toolName: "node.run",
        callId: "call-1",
        command: "node",
      },
      ["node"],
    );
    const second = await service.execute(
      {
        runId: "run-1",
        toolName: "node.run",
        callId: "call-2",
        command: "node",
      },
      ["node"],
    );

    expect(first.sessionId).not.toBe(second.sessionId);
    expect(executor.execCalls).toHaveLength(2);
  });

  it("creates unique session ids even when callId and toolName repeat", async () => {
    const executor = createExecutorMock();
    const service = new ToolboxSessionService(executor);

    const first = await service.execute(
      {
        runId: "run-repeat",
        toolName: "git.status",
        callId: "task-123",
        command: "git",
      },
      ["git"],
    );
    const second = await service.execute(
      {
        runId: "run-repeat",
        toolName: "git.status",
        callId: "task-123",
        command: "git",
      },
      ["git"],
    );

    expect(first.callId).toBe("task-123");
    expect(second.callId).toBe("task-123");
    expect(first.sessionId).not.toBe(second.sessionId);
  });

  it("publishes requested and lifecycle status events with stable correlation", async () => {
    const executor = createExecutorMock();
    const eventPublisher = createEventPublisherMock();
    const service = new ToolboxSessionService(
      executor,
      eventPublisher.publisher,
    );

    const result = await service.execute(
      {
        runId: "run-events",
        toolName: "node.run",
        callId: "task-456",
        command: "node",
      },
      ["node"],
    );

    expect(result.status).toBe("completed");
    expect(eventPublisher.events).toHaveLength(3);
    expect(eventPublisher.events.map((event) => event.status)).toEqual([
      "requested",
      "started",
      "completed",
    ]);

    for (const event of eventPublisher.events) {
      expect(event.sessionId).toBe(result.sessionId);
      expect(event.runId).toBe("run-events");
      expect(event.toolName).toBe("node.run");
      expect(event.callId).toBe("task-456");
    }
  });

  it("returns a failed result when policy denies the command", async () => {
    const executor = createExecutorMock();
    const service = new ToolboxSessionService(executor);

    const result = await service.execute(
      {
        runId: "run-2",
        toolName: "node.run",
        callId: "call-denied",
        command: "bash",
      },
      ["node"],
    );

    expect(result.status).toBe("failed");
    expect(result.stderr).toContain("Command not allowed");
    expect(executor.execCalls).toHaveLength(0);
  });

  it("marks slow executions as timed out", async () => {
    const executor = createExecutorMock(
      async () =>
        await new Promise((resolve) => {
          setTimeout(() => {
            resolve({ exitCode: 0, stdout: "late", stderr: "" });
          }, 25);
        }),
    );
    const service = new ToolboxSessionService(executor);

    const result = await service.execute(
      {
        runId: "run-3",
        toolName: "node.run",
        callId: "call-timeout",
        command: "node",
        timeoutMs: 5,
      },
      ["node"],
    );

    expect(result.status).toBe("timeout");
    expect(result.exitCode).toBe(124);
  });
});
