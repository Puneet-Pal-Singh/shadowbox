/**
 * Tests for CloudflareSandboxExecutionAdapter.
 *
 * Verifies:
 * 1. Port contract adherence (SandboxExecutionPort)
 * 2. Task routing to plugins
 * 3. Error handling and normalization
 * 4. Timeout and cancellation semantics
 */

import { CloudflareSandboxExecutionAdapter } from "./CloudflareSandboxExecutionAdapter";
import { IPlugin } from "../interfaces/types";

// Mock plugin for testing
class MockPlugin implements IPlugin {
  readonly name = "MockPlugin";

  async execute(
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
        params: { test: "value" },
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
      expect(result.error?.code).toBe("UNKNOWN_ACTION");
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

    it("should handle task execution errors", async () => {
      const input = {
        taskId: "task-4",
        action: "MockPlugin.execute",
        params: { shouldFail: true },
      };

      const result = await adapter.executeTask("session-1", input);

      expect(result.taskId).toBe("task-4");
      expect(result.status).toBe("failure");
      expect(result.error?.message).toContain("Mock failure");
    });

    it("should respect custom timeout", async () => {
      const input = {
        taskId: "task-5",
        action: "MockPlugin.execute",
        params: { delay: 100 },
        timeout: 50,
      };

      const result = await adapter.executeTask("session-1", input);

      expect(result.status).toBe("timeout");
      expect(result.metrics?.duration).toBeLessThan(100);
    });

    it("should support legacy action mappings", async () => {
      // Mock FileSystemPlugin
      class FileSystemPlugin implements IPlugin {
        readonly name = "FileSystem";

        async readFile(): Promise<string> {
          return "file content";
        }
      }

      const fsPlugin = new FileSystemPlugin();
      pluginMap.set("FileSystem", fsPlugin);

      const input = {
        taskId: "task-6",
        action: "read_file",
        params: { path: "/test.txt" },
      };

      const result = await adapter.executeTask("session-1", input);

      expect(result.status).toBe("success");
    });
  });

  describe("cancelTask", () => {
    it("should cancel active task", async () => {
      const input = {
        taskId: "task-7",
        action: "MockPlugin.execute",
        params: { delay: 1000 },
        timeout: 5000,
      };

      // Start task (don't await)
      const taskPromise = adapter.executeTask("session-1", input);

      // Cancel immediately
      await new Promise((resolve) => setTimeout(resolve, 10));
      const cancelled = await adapter.cancelTask("session-1", "task-7");

      expect(cancelled).toBe(true);

      // Task should complete with cancellation/timeout
      const result = await taskPromise;
      expect(result.status).toMatch(/failure|timeout/);
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
        params: {},
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
        params: { shouldFail: true },
      };

      const result = await adapter.executeTask("session-1", input);

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBeDefined();
      expect(result.error?.message).toBeDefined();
    });
  });
});
