import type { Sandbox } from "@cloudflare/sandbox";

export interface ToolboxCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class CloudflareToolboxAdapter {
  constructor(private sandbox: Sandbox) {}

  async execute(command: string): Promise<ToolboxCommandResult> {
    return (await this.sandbox.exec(command)) as ToolboxCommandResult;
  }
}
