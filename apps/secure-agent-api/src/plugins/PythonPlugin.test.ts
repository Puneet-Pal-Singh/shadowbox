import { describe, expect, it } from "vitest";
import type { Sandbox } from "@cloudflare/sandbox";
import { PythonPlugin } from "./PythonPlugin";

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface SandboxMock {
  execCalls: string[];
  writeFileCalls: Array<{ fileName: string; content: string }>;
  exec: (command: string) => Promise<ExecResult>;
  writeFile: (fileName: string, content: string) => Promise<void>;
}

function createSandboxMock(responses: ExecResult[]): SandboxMock {
  const execCalls: string[] = [];
  const writeFileCalls: Array<{ fileName: string; content: string }> = [];

  return {
    execCalls,
    writeFileCalls,
    async exec(command: string): Promise<ExecResult> {
      execCalls.push(command);
      return (
        responses.shift() ?? {
          exitCode: 0,
          stdout: "",
          stderr: "",
        }
      );
    },
    async writeFile(fileName: string, content: string): Promise<void> {
      writeFileCalls.push({ fileName, content });
    },
  };
}

function asSandbox(mock: SandboxMock): Sandbox {
  return mock as unknown as Sandbox;
}

describe("PythonPlugin", () => {
  it("rejects unsafe requirement specifiers before execution", async () => {
    const plugin = new PythonPlugin();
    const sandbox = createSandboxMock([]);

    const result = await plugin.execute(asSandbox(sandbox), {
      code: "print('hello')",
      requirements: ["requests; rm -rf /"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid Python requirement/i);
    expect(sandbox.execCalls).toHaveLength(0);
  });

  it("retries dependency installation for managed environments", async () => {
    const plugin = new PythonPlugin();
    const sandbox = createSandboxMock([
      { exitCode: 0, stdout: "", stderr: "" },
      {
        exitCode: 1,
        stdout: "",
        stderr: "externally-managed-environment",
      },
      { exitCode: 0, stdout: "installed", stderr: "" },
      { exitCode: 0, stdout: "ok", stderr: "" },
    ]);

    const result = await plugin.execute(asSandbox(sandbox), {
      code: "print('ok')",
      requirements: ["requests"],
      runId: "run_py_1",
    });

    expect(result.success).toBe(true);
    expect(sandbox.execCalls).toHaveLength(4);
    expect(sandbox.execCalls[2]).toContain("--break-system-packages");
  });

  it("runs python file from run-scoped workspace using safe command args", async () => {
    const plugin = new PythonPlugin();
    const sandbox = createSandboxMock([
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "42\n", stderr: "" },
    ]);

    const result = await plugin.execute(asSandbox(sandbox), {
      code: "print(42)",
      runId: "run_py_2",
    });

    expect(result.success).toBe(true);
    expect(sandbox.writeFileCalls[0]?.fileName).toBe(
      "/home/sandbox/runs/run_py_2/main.py",
    );
    expect(sandbox.execCalls[1]).toContain(
      "cd '/home/sandbox/runs/run_py_2' && 'python3' 'main.py'",
    );
  });
});
