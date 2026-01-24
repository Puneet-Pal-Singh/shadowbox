import { Sandbox } from "@cloudflare/sandbox";
import { IPlugin, PluginResult, LogCallback } from "../interfaces/types";
import { RustTool } from "../schemas/rust";

export class RustPlugin implements IPlugin {
  name = "rust";
  tools = [RustTool];

  async execute(sandbox: Sandbox, payload: { code: string }, onLog?: LogCallback): Promise<PluginResult> {
    const fileName = "main.rs";
    const binaryName = "main_bin";

    await sandbox.writeFile(fileName, payload.code);

    // 1. Compile Phase
    if (onLog) onLog(`[Rust] Compiling ${fileName}...\n`);
    const compile = await sandbox.exec(`rustc ${fileName} -o ${binaryName}`);

    if (compile.exitCode !== 0) {
      if (onLog) onLog(`\x1b[31m[Build Error]\n${compile.stderr}\x1b[0m`);
      return {
        success: false,
        output: compile.stdout,
        error: "Compilation failed",
        logs: [compile.stderr]
      };
    }

    // 2. Execution Phase
    if (onLog) onLog(`[Rust] Successfully compiled. Executing...\n`);
    const result = await sandbox.exec(`./${binaryName}`);

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