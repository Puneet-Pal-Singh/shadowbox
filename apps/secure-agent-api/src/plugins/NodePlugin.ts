import { Sandbox } from "@cloudflare/sandbox";
import { IPlugin, PluginResult, LogCallback } from "../interfaces/types";
import { NodeTool } from "../schemas/node";

export class NodePlugin implements IPlugin {
  name = "node";
  tools = [NodeTool];

  async execute(sandbox: Sandbox, payload: any, onLog?: LogCallback): Promise<PluginResult> {
    const ext = payload.isTypeScript ? "ts" : "js";
    const fileName = `index.${ext}`;
    const runner = payload.isTypeScript ? "tsx" : "node";

    await sandbox.writeFile(fileName, payload.code);
    if (onLog) onLog(`[System] Running ${runner} ${fileName}...\n`);

    const result = await sandbox.exec(`${runner} ${fileName}`);

    if (onLog) {
        if (result.stdout) onLog(result.stdout);
        if (result.stderr) onLog(`\x1b[31m${result.stderr}\x1b[0m`);
    }

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined
    };
  }
}