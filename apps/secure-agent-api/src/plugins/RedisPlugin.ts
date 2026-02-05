// src/plugins/RedisPlugin.ts
import { Sandbox } from "@cloudflare/sandbox";
import { IPlugin, PluginResult } from "../interfaces/types";
import { RedisTool } from "../schemas/redis"; // Import the definition

// ==========================================
// CONFIGURATION SWITCH
// TRUE  = Custom Go-Redis 
// FALSE = Use Official Redis (Debug Mode)
// ==========================================
const USE_CUSTOM_BINARY = true;

export class RedisPlugin implements IPlugin {
  name = "redis";
  private activePort = 0;

  // Define the tool this plugin provides
  tools = [RedisTool];

  async setup(sandbox: Sandbox): Promise<void> {
    const mode = USE_CUSTOM_BINARY ? "Custom Go-Redis" : "Official Redis";
    console.log(`[Sidecar:Redis] Initializing ${mode}...`);

    // 1. Prepare Data Directory (Just in case)
    await sandbox.exec("mkdir -p /data");

    // 2. Start the Service
    if (USE_CUSTOM_BINARY) {
      // Check binary existence
      const checkBin = await sandbox.exec("ls -l /usr/local/bin/my-redis-server");
      if (checkBin.exitCode !== 0) {
        throw new Error(`Binary missing! ls result: ${checkBin.stderr}`);
      }

      console.log("[Sidecar:Redis] 🚀 Booting Custom Binary...");
      
      // FIX: Run WITHOUT flags first to eliminate argument parsing errors.
      // It should default to port 6378 and internal memory map.
      // We explicitly capture stdout/stderr to redis.log
      const cmd = "nohup /usr/local/bin/my-redis-server > /root/redis.log 2>&1 &";
      await sandbox.exec(cmd);

    } else {
      console.log("[Sidecar:Redis] 🚀 Booting Standard redis-server...");
      await sandbox.exec("redis-server --port 6379 --daemonize yes --logfile /root/redis.log");
    }

    // 3. Health Check (Check 6379 AND 6378)
    console.log("[Sidecar:Redis] Waiting for socket...");
    let attempts = 0;
    while (attempts < 10) {
      await new Promise(r => setTimeout(r, 500));
      
      // Check Standard 6379
      if ((await sandbox.exec("nc -z localhost 6379")).exitCode === 0) {
        this.activePort = 6379;
        console.log(`[Sidecar:Redis] ✅ Active on 6379`);
        return;
      }

      // Check Custom 6378 (Your default)
      if ((await sandbox.exec("nc -z localhost 6378")).exitCode === 0) {
        this.activePort = 6378;
        console.log(`[Sidecar:Redis] ✅ Active on 6378`);
        return;
      }

      attempts++;
    }

    // 4. CRITICAL FAILURE: DUMP LOGS
    const logs = await sandbox.exec("cat /root/redis.log");
    console.error("------------------------------------------------");
    console.error("❌ REDIS STARTUP FAILED. INTERNAL LOGS:");
    console.error(logs.stdout || "(Log file is empty)");
    console.error("------------------------------------------------");
    
    // Throwing error here ensures the AgentRuntime knows setup failed
    throw new Error(`Redis Sidecar failed to start. Logs: ${logs.stdout.slice(0, 100)}`);
  }

  async execute(sandbox: Sandbox): Promise<PluginResult> {
    const port = this.activePort || 6378;
    const check = await sandbox.exec(`nc -z localhost ${port}`);
    
    // Always fetch logs if check fails
    let logs: string[] = [];
    if (check.exitCode !== 0) {
        const logCmd = await sandbox.exec("cat /root/redis.log");
        logs = logCmd.stdout ? logCmd.stdout.split("\n") : ["Unable to read logs"];
    }

    return {
      success: check.exitCode === 0,
      output: check.exitCode === 0 ? `Active (Port ${port})` : "Stopped",
      logs: logs
    };
  }
}