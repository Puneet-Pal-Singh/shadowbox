import { Sandbox } from "@cloudflare/sandbox";

export interface SafeCommandSpec {
  command: string;
  args?: string[];
  cwd?: string;
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runSafeCommand(
  sandbox: Sandbox,
  spec: SafeCommandSpec,
  allowlist: readonly string[],
): Promise<CommandResult> {
  validateCommandSpec(spec, allowlist);

  const args = spec.args ?? [];
  const escapedCommand = escapeShellArg(spec.command);
  const escapedArgs = args.map((arg) => escapeShellArg(arg));
  const commandExpr = [escapedCommand, ...escapedArgs].join(" ");

  const finalCommand = spec.cwd
    ? `cd ${escapeShellArg(spec.cwd)} && ${commandExpr}`
    : commandExpr;

  const result = (await sandbox.exec(finalCommand)) as CommandResult;
  return result;
}

function validateCommandSpec(
  spec: SafeCommandSpec,
  allowlist: readonly string[],
): void {
  const command = spec.command.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(command)) {
    throw new Error("Invalid command");
  }
  if (!allowlist.includes(command)) {
    throw new Error(`Command not allowed: ${command}`);
  }

  const args = spec.args ?? [];
  for (const arg of args) {
    if (/[\0\r\n]/.test(arg)) {
      throw new Error("Invalid command argument");
    }
  }

  if (spec.cwd && /[\0\r\n]/.test(spec.cwd)) {
    throw new Error("Invalid command cwd");
  }
}

export function escapeShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
