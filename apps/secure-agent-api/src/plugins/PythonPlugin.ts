import { Sandbox } from "@cloudflare/sandbox";
import { IPlugin, PluginResult, LogCallback } from "../interfaces/types";
import { PythonTool } from "../schemas/python"; 

export class PythonPlugin implements IPlugin {
  name = "python";
  tools = [PythonTool];

  async execute(sandbox: Sandbox, payload: { code: string; requirements?: string[] }, onLog?: LogCallback): Promise<PluginResult> {
    
    // 1. Notify Start
    if (onLog) onLog(`[System] Initializing Python environment...`);

    // 2. Install Requirements (Smart Mode)
    if (payload.requirements?.length) {
      const packages = payload.requirements.join(" ");
      
      // Stream status update
      if (onLog) onLog(`[System] Installing dependencies: ${packages}...`);

      // Attempt 1: Standard Install
      let install = await sandbox.exec(`python3 -m pip install ${packages}`);

      // Attempt 2: Managed Environment Retry
      if (install.exitCode !== 0 && install.stderr.includes("externally-managed-environment")) {
        if (onLog) onLog(`[System] Managed environment detected. Retrying with --break-system-packages...`);
        install = await sandbox.exec(`python3 -m pip install ${packages} --break-system-packages`);
      }

      // Stream installation output (So user sees download progress/errors)
      if (onLog) {
        if (install.stdout) onLog(install.stdout);
        if (install.stderr) onLog(install.stderr);
      }

      // Fail fast
      if (install.exitCode !== 0) {
        return {
          success: false,
          output: install.stdout,
          logs: install.stderr.split("\n"),
          error: `Dependency installation failed.`
        };
      }
    }

    // 3. Write Code
    await sandbox.writeFile("main.py", payload.code);

    // 4. Execute
    if (onLog) onLog(`[System] Executing script...`);
    const result = await sandbox.exec("python3 main.py");

    // Stream the final execution output
    if (onLog) {
        if (result.stdout) onLog(result.stdout);
        if (result.stderr) onLog(`[stderr] ${result.stderr}`); // Distinguish errors visually
    }

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      logs: result.stderr ? result.stderr.split("\n") : [],
      error: result.exitCode !== 0 ? "Execution failed" : undefined
    };
  }
}