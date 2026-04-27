import type { Sandbox } from "@cloudflare/sandbox";
import type {
  ToolboxCommandExecutionOptions,
  ToolboxCommandExecutor,
  ToolboxCommandResult,
} from "../contracts/ToolboxSession";

export class CloudflareToolboxAdapter implements ToolboxCommandExecutor {
  constructor(private sandbox: Sandbox) {}

  async execute(
    command: string,
    options?: ToolboxCommandExecutionOptions,
  ): Promise<ToolboxCommandResult> {
    return (await this.sandbox.exec(command, {
      cwd: options?.cwd,
      env: options?.env,
    })) as ToolboxCommandResult;
  }
}
