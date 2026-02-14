import { describe, expect, it } from "vitest";
import type { Sandbox } from "@cloudflare/sandbox";
import { NodePlugin } from "../NodePlugin";
import { FileSystemPlugin } from "../FileSystemPlugin";
import { GitPlugin } from "../GitPlugin";

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface SandboxMock {
  execCalls: string[];
  exec: (command: string) => Promise<ExecResult>;
  writeFile: (fileName: string, content: string) => Promise<void>;
}

function createSandboxMock(): SandboxMock {
  const execCalls: string[] = [];
  return {
    execCalls,
    async exec(command: string): Promise<ExecResult> {
      execCalls.push(command);
      return { exitCode: 0, stdout: "", stderr: "" };
    },
    async writeFile(): Promise<void> {
      return;
    },
  };
}

function asSandbox(mock: SandboxMock): Sandbox {
  return mock as unknown as Sandbox;
}

describe("secure-agent-api plugin hardening", () => {
  it("rejects command injection tokens in node command", async () => {
    const plugin = new NodePlugin();
    const sandbox = createSandboxMock();

    const result = await plugin.execute(asSandbox(sandbox), {
      action: "run",
      runId: "run-safe-1",
      command: "node; rm -rf /",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unsafe shell token detected in command/i);
    expect(sandbox.execCalls).toHaveLength(1);
  });

  it("rejects command injection tokens in node args", async () => {
    const plugin = new NodePlugin();
    const sandbox = createSandboxMock();

    const result = await plugin.execute(asSandbox(sandbox), {
      action: "run",
      runId: "run-safe-2",
      command: "node",
      args: ["-e", "console.log('ok'); cat /etc/passwd"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unsafe shell token detected in args/i);
    expect(sandbox.execCalls).toHaveLength(1);
  });

  it("rejects filesystem traversal and absolute paths", async () => {
    const plugin = new FileSystemPlugin();
    const sandbox = createSandboxMock();

    const traversal = await plugin.execute(asSandbox(sandbox), {
      action: "read_file",
      runId: "run-safe-3",
      path: "../../etc/passwd",
    });
    expect(traversal.success).toBe(false);
    expect(traversal.error).toMatch(/traversal|Access Denied/i);

    const absolute = await plugin.execute(asSandbox(sandbox), {
      action: "read_file",
      runId: "run-safe-3",
      path: "/etc/passwd",
    });
    expect(absolute.success).toBe(false);
    expect(absolute.error).toMatch(/absolute paths are not allowed/i);
  });

  it("validates git auth token format", async () => {
    const plugin = new GitPlugin();
    const sandbox = createSandboxMock();

    const invalidToken = await plugin.execute(asSandbox(sandbox), {
      action: "git_config",
      runId: "run-safe-4",
      token: "bad\ntoken",
    });
    expect(invalidToken.success).toBe(false);
    expect(invalidToken.error).toMatch(/Invalid token format/i);

    const validToken = await plugin.execute(asSandbox(sandbox), {
      action: "git_config",
      runId: "run-safe-4",
      token: "ghp_validToken123",
    });
    expect(validToken.success).toBe(true);
    expect(validToken.output).toBe("Token validated for authenticated git actions");
  });
});
