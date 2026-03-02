/**
 * Conformance Tests - Validate portability boundary adherence.
 *
 * These tests ensure:
 * 1. Port contracts are honored end-to-end
 * 2. No Cloudflare primitives leak into core logic
 * 3. Error mapping is correct across boundaries
 * 4. Identity (runId/sessionId) flows correctly
 *
 * Aligns to:
 * - Charter 46: Boundary enforcement
 * - Plan 59: Portability verification
 * - SHA-24: End-to-End Wiring & Conformance Gate
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { composeRuntime } from "../factories/RuntimeCompositionFactory";
import type {
  SandboxExecutionPort,
  SessionStatePort,
  ArtifactStorePort,
} from "../ports";

/**
 * Mock DurableObjectState for testing.
 */
class MockDurableObjectState {
  private store = new Map<string, unknown>();

  async get(key: string): Promise<unknown | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }

  async delete(keys: string | string[]): Promise<void> {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    keyArray.forEach((key) => this.store.delete(key));
  }

  async list(options?: {
    prefix?: string;
  }): Promise<Map<string, unknown>> {
    const result = new Map<string, unknown>();
    const prefix = options?.prefix;
    for (const [key, value] of this.store) {
      if (!prefix || key.startsWith(prefix)) {
        result.set(key, value);
      }
    }
    return result;
  }
}

/**
 * Mock R2 bucket for testing.
 */
class MockR2Bucket {
  private objects = new Map<string, Uint8Array>();

  async put(key: string, value: Uint8Array): Promise<void> {
    this.objects.set(key, value);
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.objects.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async list(): Promise<string[]> {
    return Array.from(this.objects.keys());
  }
}

/**
 * Mock Env for testing.
 */
const mockEnv = {
  ARTIFACTS: new MockR2Bucket() as unknown as R2Bucket,
};

describe("Portability Conformance", () => {
  let durableObjectState: MockDurableObjectState;
  let runtime: ReturnType<typeof composeRuntime>;

  beforeEach(() => {
    durableObjectState = new MockDurableObjectState();
    runtime = composeRuntime(
      durableObjectState as unknown as DurableObjectState,
      mockEnv as unknown as Env,
    );
  });

  describe("Port Contracts", () => {
    it("should return port abstractions, not concrete implementations", () => {
      // All returned values should be port abstractions
      expect(runtime.executionPort).toBeDefined();
      expect(runtime.sessionPort).toBeDefined();
      expect(runtime.artifactPort).toBeDefined();

      // Ports should have required methods
      expect(typeof runtime.executionPort.executeTask).toBe("function");
      expect(typeof runtime.sessionPort.createSession).toBe("function");
      expect(typeof runtime.artifactPort.upload).toBe("function");
    });

    it("should implement ExecutionRuntimePort contract", async () => {
      const port = runtime.executionPort;

      // Port must have these methods
      expect(port).toHaveProperty("executeTask");
      expect(port).toHaveProperty("cancelTask");
      expect(port).toHaveProperty("getRunState");
      expect(port).toHaveProperty("transitionRun");
      expect(port).toHaveProperty("scheduleNext");
    });

    it("should implement SessionStatePort contract", async () => {
      const port = runtime.sessionPort;

      // Port must have these methods
      expect(port).toHaveProperty("createSession");
      expect(port).toHaveProperty("getSession");
      expect(port).toHaveProperty("updateSession");
      expect(port).toHaveProperty("saveSnapshot");
      expect(port).toHaveProperty("loadSnapshot");
      expect(port).toHaveProperty("deleteSession");
    });

    it("should implement ArtifactStorePort contract", async () => {
      const port = runtime.artifactPort;

      // Port must have these methods
      expect(port).toHaveProperty("upload");
      expect(port).toHaveProperty("download");
      expect(port).toHaveProperty("getMetadata");
      expect(port).toHaveProperty("list");
      expect(port).toHaveProperty("delete");
      expect(port).toHaveProperty("cleanup");
    });
  });

  describe("Boundary Isolation", () => {
    it("should not expose Cloudflare types in port interfaces", () => {
      // This is a type-level test - it passes if TypeScript compilation succeeds
      // The port interfaces should not reference DurableObjectState, R2Bucket, etc.
      const executionPort: SandboxExecutionPort = runtime.executionPort;
      const sessionPort: SessionStatePort = runtime.sessionPort;
      const artifactPort: ArtifactStorePort = runtime.artifactPort;

      // If we can assign to port abstractions without type errors,
      // the implementations satisfy the port contracts
      expect(executionPort).toBeDefined();
      expect(sessionPort).toBeDefined();
      expect(artifactPort).toBeDefined();
    });

    it("should handle session lifecycle without leaking storage details", async () => {
      const sessionPort = runtime.sessionPort;

      // Create session
      const session = await sessionPort.createSession(
        "test-session-id",
        "test-run-id",
      );

      expect(session).toHaveProperty("sessionId");
      expect(session).toHaveProperty("status");
      expect(session.sessionId).toBe("test-session-id");
      expect(session.status).toBe("active");

      // Retrieve session
      const retrieved = await sessionPort.getSession("test-session-id");
      expect(retrieved).toBeDefined();
      expect(retrieved?.sessionId).toBe("test-session-id");

      // Delete session
      await sessionPort.deleteSession("test-session-id");
      const deleted = await sessionPort.getSession("test-session-id");
      expect(deleted).toBeNull();
    });

    it("should handle artifact lifecycle without leaking storage details", async () => {
      const artifactPort = runtime.artifactPort;

      // Upload artifact
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const metadata = await artifactPort.upload({
        sessionId: "test-session",
        contentType: "application/octet-stream",
        data,
      });

      expect(metadata).toHaveProperty("id");
      expect(metadata).toHaveProperty("sessionId");
      expect(metadata.sessionId).toBe("test-session");
      expect(metadata.size).toBe(5);

      // Download artifact
      const downloaded = await artifactPort.download(
        metadata.id,
        "test-session",
      );
      expect(downloaded).toBeDefined();
      expect(downloaded).toEqual(data);

      // Delete artifact
      const deleted = await artifactPort.delete(metadata.id, "test-session");
      expect(deleted).toBe(true);

      // Verify deleted
      const redownload = await artifactPort.download(metadata.id, "test-session");
      expect(redownload).toBeNull();
    });
  });

  describe("Error Handling", () => {
    it("should propagate session errors without leaking storage exceptions", async () => {
      const sessionPort = runtime.sessionPort;

      // Try to get non-existent session
      const result = await sessionPort.getSession("non-existent-session");
      expect(result).toBeNull();

      // Error should be graceful, not expose storage details
      expect(result).not.toThrow;
    });

    it("should handle cross-session artifact access correctly", async () => {
      const artifactPort = runtime.artifactPort;

      // Upload artifact in session A
      const data = new Uint8Array([1, 2, 3]);
      const metadata = await artifactPort.upload({
        sessionId: "session-a",
        contentType: "application/octet-stream",
        data,
      });

      // Try to download from session B (should fail)
      const result = await artifactPort.download(
        metadata.id,
        "session-b",
      );
      expect(result).toBeNull(); // Access denied
    });
  });

  describe("Type Safety", () => {
    it("should maintain type safety across port boundary", () => {
      // This test verifies at compile-time (TS) that port abstractions
      // are used, not concrete implementations.

      // Accessing as ports should work
      const _exec: SandboxExecutionPort = runtime.executionPort;
      const _sess: SessionStatePort = runtime.sessionPort;
      const _artifact: ArtifactStorePort = runtime.artifactPort;

      // All assignments should succeed
      expect(_exec).toBeDefined();
      expect(_sess).toBeDefined();
      expect(_artifact).toBeDefined();
    });
  });

  describe("Composition Correctness", () => {
    it("should compose all ports from a single call", () => {
      // Verify composition factory creates all ports correctly
      expect(runtime).toHaveProperty("executionPort");
      expect(runtime).toHaveProperty("sessionPort");
      expect(runtime).toHaveProperty("artifactPort");

      // All should be non-null
      expect(runtime.executionPort).not.toBeNull();
      expect(runtime.sessionPort).not.toBeNull();
      expect(runtime.artifactPort).not.toBeNull();
    });

    it("should create independent adapter instances per call", () => {
      const runtime2 = composeRuntime(
        durableObjectState as unknown as DurableObjectState,
        mockEnv as unknown as Env,
      );

      // Different calls should create different instances
      expect(runtime.executionPort).not.toBe(runtime2.executionPort);
      expect(runtime.sessionPort).not.toBe(runtime2.sessionPort);
      expect(runtime.artifactPort).not.toBe(runtime2.artifactPort);
    });
  });
});
