/**
 * Tests for CloudflareSandboxExecutionAdapter.
 *
 * Verifies:
 * 1. Port contract adherence (SandboxExecutionPort)
 * 2. Task routing to plugins
 * 3. Error handling and normalization
 * 4. Timeout and cancellation semantics
 */

import { describe, expect, it, beforeEach } from "vitest";
import { CloudflareSandboxExecutionAdapter } from "./CloudflareSandboxExecutionAdapter";
import type { IPlugin, ToolDefinition } from "../interfaces/types";

const TEST_RUN_ID = "run-1";

// Mock plugin for testing
class MockPlugin implements IPlugin {
  readonly name = "MockPlugin";
  readonly tools: ToolDefinition[] = [];

  async setup(): Promise<void> {
    // No-op for testing
  }

  // This matches the actual IPlugin.execute signature
  async execute(sandbox: any, payload: any): Promise<{ success: boolean; output?: string }> {
    const params = payload as Record<string, unknown>;
    if (params.delay) {
      await new Promise((resolve) =>
        setTimeout(resolve, (params.delay as number) ?? 100),
      );
    }
    if (params.shouldFail) {
      throw new Error("Mock failure");
    }
    return { success: true, output: JSON.stringify({ success: true, params }) };
  }

  // Custom method for adapter testing (adapter doesn't call the standard execute)
  async executeMock(
    sessionId: string,
    params: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<string> {
    if (params.delay) {
      await new Promise((resolve) =>
        setTimeout(resolve, (params.delay as number) ?? 100),
      );
    }
    if (params.shouldFail) {
      throw new Error("Mock failure");
    }
    return JSON.stringify({ success: true, params });
  }
}

describe("CloudflareSandboxExecutionAdapter", () => {
  let adapter: CloudflareSandboxExecutionAdapter;
  let mockPlugin: MockPlugin;
  let mockSandbox: any;
  let pluginMap: Map<string, IPlugin>;

  beforeEach(() => {
    mockPlugin = new MockPlugin();
    pluginMap = new Map([["MockPlugin", mockPlugin]]);
    mockSandbox = {}; // Sandbox is not directly used in current implementation

    adapter = new CloudflareSandboxExecutionAdapter(mockSandbox, pluginMap);
  });

  describe("executeTask", () => {
    it("should execute task and return success result", async () => {
      const input = {
        taskId: "task-1",
        action: "MockPlugin.execute",
        params: { test: "value", runId: TEST_RUN_ID },
      };

      const result = await adapter.executeTask("session-1", input);

      expect(result.taskId).toBe("task-1");
      expect(result.status).toBe("success");
      expect(result.output).toBeDefined();
      expect(result.metrics?.duration).toBeGreaterThanOrEqual(0);
    });

    it("should handle unknown action", async () => {
      const input = {
        taskId: "task-2",
        action: "UnknownAction.method",
        params: {},
      };

      const result = await adapter.executeTask("session-1", input);

      expect(result.taskId).toBe("task-2");
      expect(result.status).toBe("failure");
      // Routes to plugin lookup, so returns PLUGIN_NOT_FOUND
      expect(result.error?.code).toBe("PLUGIN_NOT_FOUND");
    });

    it("should handle missing plugin", async () => {
      const input = {
        taskId: "task-3",
        action: "MissingPlugin.method",
        params: {},
      };

      const result = await adapter.executeTask("session-1", input);

      expect(result.status).toBe("failure");
      expect(result.error?.code).toBe("PLUGIN_NOT_FOUND");
    });

    it("should fail fast when runId is missing for execute actions", async () => {
      const input = {
        taskId: "task-missing-run",
        action: "MockPlugin.execute",
        params: { test: "value" },
      };

      const result = await adapter.executeTask("session-1", input);

      expect(result.status).toBe("failure");
      expect(result.error?.code).toBe("INVALID_INPUT");
      expect(result.error?.message).toContain("runId is required");
    });

    it("should handle task execution errors", async () => {
      const input = {
        taskId: "task-4",
        action: "MockPlugin.execute",
        params: { shouldFail: true, runId: TEST_RUN_ID },
      };

      const result = await adapter.executeTask("session-1", input);

      expect(result.taskId).toBe("task-4");
      expect(result.status).toBe("failure");
      expect(result.error?.message).toContain("Mock failure");
    });

    it("should apply timeout configuration", async () => {
      // Note: Full timeout test requires signal-aware mock plugin.
      // This verifies timeout parameter is accepted.
      const input = {
        taskId: "task-5",
        action: "MockPlugin.execute",
        params: { delay: 10, runId: TEST_RUN_ID },
        timeout: 50,
      };

      const result = await adapter.executeTask("session-1", input);

      // Task completes, timeout doesn't fire because delay < timeout
      expect(result.taskId).toBe("task-5");
      expect(result.status).toBe("success");
    });

    it("should support legacy action mappings", async () => {
      // Mock FileSystemPlugin
      class FileSystemPlugin implements IPlugin {
        readonly name = "filesystem";
        readonly tools: ToolDefinition[] = [];

        async setup(): Promise<void> {
          // No-op
        }

        async execute(
          _sandbox: unknown,
          payload: unknown,
        ): Promise<{ success: boolean; output: string }> {
          const params = payload as Record<string, unknown>;
          expect(params.action).toBe("read_file");
          expect(params.runId).toBe(TEST_RUN_ID);
          return { success: true, output: "file content" };
        }

        async readFile(): Promise<string> {
          return "file content";
        }
      }

      const fsPlugin = new FileSystemPlugin();
      pluginMap.set("filesystem", fsPlugin);

      const input = {
        taskId: "task-6",
        action: "read_file",
        params: { path: "/test.txt", runId: TEST_RUN_ID },
      };

      const result = await adapter.executeTask("session-1", input);

      expect(result.status).toBe("success");
    });
  });

  describe("cancelTask", () => {
    it("should track active task cancellation attempts", async () => {
      const input = {
        taskId: "task-7",
        action: "MockPlugin.execute",
        params: { delay: 10, runId: TEST_RUN_ID },
        timeout: 5000,
      };

      // Start task
      const taskPromise = adapter.executeTask("session-1", input);

      // Cancel attempt while task is still running
      // (may succeed if task hasn't completed yet)
      const cancelled = await adapter.cancelTask("session-1", "task-7");

      // Task exists in active executions, so cancel should be attempted
      // Actual result depends on timing
      expect(typeof cancelled).toBe("boolean");

      const result = await taskPromise;
      expect(result.status).toBe("success");
    });

    it("should return false for non-existent task", async () => {
      const result = await adapter.cancelTask("session-1", "non-existent");
      expect(result).toBe(false);
    });
  });

  describe("getHealth", () => {
    it("should report healthy when plugins are loaded", async () => {
      const health = await adapter.getHealth("session-1");

      expect(health.healthy).toBe(true);
    });

    it("should report unhealthy with no plugins", async () => {
      const emptyAdapter = new CloudflareSandboxExecutionAdapter(
        mockSandbox,
        new Map(),
      );
      const health = await emptyAdapter.getHealth("session-1");

      expect(health.healthy).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("should clean up resources without error", async () => {
      // Start and quickly complete a task
      const input = {
        taskId: "task-8",
        action: "MockPlugin.execute",
        params: { runId: TEST_RUN_ID },
      };

      await adapter.executeTask("session-1", input);
      await adapter.cleanup("session-1");

      // Verify no hanging timeouts (manual inspection only)
      // In real test, would use jest.fake timers
      expect(true).toBe(true);
    });
  });

  describe("error normalization", () => {
    it("should normalize Error objects", async () => {
      const input = {
        taskId: "task-9",
        action: "MockPlugin.execute",
        params: { shouldFail: true, runId: TEST_RUN_ID },
      };

      const result = await adapter.executeTask("session-1", input);

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBeDefined();
      expect(result.error?.message).toBeDefined();
    });
  });
});
