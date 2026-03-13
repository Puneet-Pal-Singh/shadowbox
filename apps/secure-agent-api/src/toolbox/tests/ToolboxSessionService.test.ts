import { describe, expect, it } from "vitest";
import type { Sandbox } from "@cloudflare/sandbox";
import { CloudflareToolboxAdapter } from "../adapters/CloudflareToolboxAdapter";
import { ToolboxSessionService } from "../services/ToolboxSessionService";

interface SandboxMock {
  execCalls: string[];
  exec: (command: string) => Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
}

function createSandboxMock(
  execImpl?: SandboxMock["exec"],
): SandboxMock {
  const execCalls: string[] = [];
  return {
    execCalls,
    exec: execImpl
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

describe("ToolboxSessionService", () => {
  it("creates a unique toolbox session per execution", async () => {
    const sandbox = createSandboxMock();
    const service = new ToolboxSessionService(
      new CloudflareToolboxAdapter(sandbox as unknown as Sandbox),
    );

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
    expect(sandbox.execCalls).toHaveLength(2);
  });

  it("returns a failed result when policy denies the command", async () => {
    const sandbox = createSandboxMock();
    const service = new ToolboxSessionService(
      new CloudflareToolboxAdapter(sandbox as unknown as Sandbox),
    );

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
    expect(sandbox.execCalls).toHaveLength(0);
  });

  it("marks slow executions as timed out", async () => {
    const sandbox = createSandboxMock(
      async () =>
        await new Promise((resolve) => {
          setTimeout(() => {
            resolve({ exitCode: 0, stdout: "late", stderr: "" });
          }, 25);
        }),
    );
    const service = new ToolboxSessionService(
      new CloudflareToolboxAdapter(sandbox as unknown as Sandbox),
    );

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
