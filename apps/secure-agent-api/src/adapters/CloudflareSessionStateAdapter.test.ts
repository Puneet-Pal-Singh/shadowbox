/**
 * Tests for CloudflareSessionStateAdapter.
 *
 * Verifies:
 * 1. Port contract adherence (SessionStatePort)
 * 2. Session lifecycle (create, read, update, delete)
 * 3. Snapshot persistence and recovery
 * 4. Data isolation and immutability
 */

import { CloudflareSessionStateAdapter } from "./CloudflareSessionStateAdapter";
import { SessionState, SessionSnapshot } from "../ports";

// Mock Durable Object state
class MockDurableObjectState {
  private storage = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.storage.get(key);
  }

  async put(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
  }

  async delete(keys: string[]): Promise<void> {
    keys.forEach((key) => this.storage.delete(key));
  }

  async list(options?: any): Promise<string[]> {
    const prefix = options?.prefix;
    return Array.from(this.storage.keys()).filter(
      (key) => !prefix || key.startsWith(prefix),
    );
  }

  // Expose storage for test verification
  getStorage(): Map<string, string> {
    return this.storage;
  }
}

describe("CloudflareSessionStateAdapter", () => {
  let adapter: CloudflareSessionStateAdapter;
  let mockState: MockDurableObjectState;

  beforeEach(() => {
    mockState = new MockDurableObjectState();
    adapter = new CloudflareSessionStateAdapter(mockState as any);
  });

  describe("createSession", () => {
    it("should create session with defaults", async () => {
      const session = await adapter.createSession(
        "session-1",
        "run-1",
      );

      expect(session.sessionId).toBe("session-1");
      expect(session.runId).toBe("run-1");
      expect(session.status).toBe("active");
      expect(session.createdAt).toBeGreaterThan(0);
      expect(session.updatedAt).toBeGreaterThan(0);
    });

    it("should create session with initial state", async () => {
      const session = await adapter.createSession(
        "session-2",
        "run-2",
        {
          status: "paused",
          metadata: { key: "value" },
        },
      );

      expect(session.status).toBe("paused");
      expect(session.metadata?.key).toBe("value");
    });

    it("should persist session to storage", async () => {
      await adapter.createSession("session-3", "run-3");

      const stored = mockState.getStorage().get("session:state:session-3");
      expect(stored).toBeDefined();
      expect(JSON.parse(stored!).sessionId).toBe("session-3");
    });
  });

  describe("getSession", () => {
    it("should retrieve existing session", async () => {
      const created = await adapter.createSession("session-4", "run-4");
      const retrieved = await adapter.getSession("session-4");

      expect(retrieved).toEqual(created);
    });

    it("should return null for missing session", async () => {
      const retrieved = await adapter.getSession("non-existent");
      expect(retrieved).toBeNull();
    });

    it("should handle corrupted session data", async () => {
      const storage = mockState.getStorage();
      storage.set("session:state:bad-session", "not valid json");

      const retrieved = await adapter.getSession("bad-session");
      expect(retrieved).toBeNull();
    });
  });

  describe("updateSession", () => {
    it("should update session state", async () => {
      await adapter.createSession("session-5", "run-5");

      await adapter.updateSession("session-5", { status: "completed" });

      const updated = await adapter.getSession("session-5");
      expect(updated?.status).toBe("completed");
    });

    it("should not allow sessionId mutation", async () => {
      const created = await adapter.createSession("session-6", "run-6");

      await adapter.updateSession("session-6", {
        sessionId: "different-id" as any,
      });

      const updated = await adapter.getSession("session-6");
      expect(updated?.sessionId).toBe("session-6");
    });

    it("should not allow createdAt mutation", async () => {
      const originalTime = Date.now() - 10000;
      const created = await adapter.createSession("session-7", "run-7", {
        createdAt: originalTime,
      });

      await adapter.updateSession("session-7", {
        createdAt: Date.now(),
      } as any);

      const updated = await adapter.getSession("session-7");
      expect(updated?.createdAt).toBe(originalTime);
    });

    it("should update updatedAt timestamp", async () => {
      const created = await adapter.createSession("session-8", "run-8");
      const originalUpdatedAt = created.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));
      await adapter.updateSession("session-8", { status: "paused" });

      const updated = await adapter.getSession("session-8");
      expect(updated!.updatedAt).toBeGreaterThan(originalUpdatedAt);
    });

    it("should throw on update to missing session", async () => {
      await expect(
        adapter.updateSession("non-existent", { status: "completed" }),
      ).rejects.toThrow();
    });
  });

  describe("saveSnapshot", () => {
    it("should persist snapshot", async () => {
      const snapshot: SessionSnapshot = {
        sessionId: "session-9",
        runId: "run-9",
        messages: [{ role: "user", content: "test" }],
        toolCalls: [],
        state: {
          sessionId: "session-9",
          status: "active",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        checkpoint: 1,
      };

      await adapter.saveSnapshot(snapshot);

      const stored = mockState
        .getStorage()
        .get("session:snapshot:session-9");
      expect(stored).toBeDefined();
      expect(JSON.parse(stored!).checkpoint).toBe(1);
    });

    it("should save metadata alongside snapshot", async () => {
      const snapshot: SessionSnapshot = {
        sessionId: "session-10",
        runId: "run-10",
        messages: [],
        toolCalls: [],
        state: {
          sessionId: "session-10",
          status: "active",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        checkpoint: 2,
      };

      await adapter.saveSnapshot(snapshot);

      const metadata = mockState
        .getStorage()
        .get("snapshot:metadata:session-10");
      expect(metadata).toBeDefined();
      const parsed = JSON.parse(metadata!);
      expect(parsed.checkpoint).toBe(2);
      expect(parsed.savedAt).toBeGreaterThan(0);
    });
  });

  describe("loadSnapshot", () => {
    it("should retrieve saved snapshot", async () => {
      const snapshot: SessionSnapshot = {
        sessionId: "session-11",
        runId: "run-11",
        messages: [{ role: "assistant", content: "response" }],
        toolCalls: [],
        state: {
          sessionId: "session-11",
          status: "active",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        checkpoint: 3,
      };

      await adapter.saveSnapshot(snapshot);
      const retrieved = await adapter.loadSnapshot("session-11");

      expect(retrieved).toEqual(snapshot);
    });

    it("should return null for missing snapshot", async () => {
      const retrieved = await adapter.loadSnapshot("non-existent");
      expect(retrieved).toBeNull();
    });

    it("should handle corrupted snapshot data", async () => {
      const storage = mockState.getStorage();
      storage.set("session:snapshot:bad", "not valid json");

      const retrieved = await adapter.loadSnapshot("bad");
      expect(retrieved).toBeNull();
    });
  });

  describe("deleteSession", () => {
    it("should delete session and related data", async () => {
      const sessionId = "session-12";
      await adapter.createSession(sessionId, "run-12");

      const snapshot: SessionSnapshot = {
        sessionId,
        runId: "run-12",
        messages: [],
        toolCalls: [],
        state: {
          sessionId,
          status: "active",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        checkpoint: 1,
      };
      await adapter.saveSnapshot(snapshot);

      await adapter.deleteSession(sessionId);

      expect(await adapter.getSession(sessionId)).toBeNull();
      expect(await adapter.loadSnapshot(sessionId)).toBeNull();
    });

    it("should handle deletion of non-existent session", async () => {
      // Should not throw
      await expect(
        adapter.deleteSession("non-existent"),
      ).resolves.toBeUndefined();
    });
  });
});
