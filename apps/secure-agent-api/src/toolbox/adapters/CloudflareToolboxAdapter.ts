import type { Sandbox } from "@cloudflare/sandbox";
import type {
  ToolboxCommandExecutor,
  ToolboxCommandResult,
} from "../contracts/ToolboxSession";

export class CloudflareToolboxAdapter implements ToolboxCommandExecutor {
  constructor(private sandbox: Sandbox) {}

  async execute(command: string): Promise<ToolboxCommandResult> {
    return (await this.sandbox.exec(command)) as ToolboxCommandResult;
  }
}
