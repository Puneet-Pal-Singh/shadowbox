/**
 * Tests for CloudflareArtifactStoreAdapter.
 *
 * Verifies:
 * 1. Port contract adherence (ArtifactStorePort)
 * 2. Upload/download/delete operations
 * 3. Session isolation and ownership validation
 * 4. Metadata handling and artifact lifecycle
 */

import { CloudflareArtifactStoreAdapter } from "./CloudflareArtifactStoreAdapter";
import { ArtifactMetadata } from "../ports";

// Mock R2 bucket
class MockR2Bucket {
  private objects = new Map<
    string,
    { data: Uint8Array; metadata: Record<string, string>; uploaded: Date }
  >();

  async head(key: string) {
    const obj = this.objects.get(key);
    if (!obj) return null;

    return {
      key,
      version: "v1",
      size: obj.data.length,
      etag: "etag",
      uploaded: obj.uploaded,
      httpMetadata: { "content-type": "application/octet-stream" },
    };
  }

  async get(key: string) {
    const obj = this.objects.get(key);
    if (!obj) return null;

    return {
      key,
      version: "v1",
      size: obj.data.length,
      etag: "etag",
      uploaded: obj.uploaded,
      arrayBuffer: async () => obj.data.buffer,
      httpMetadata: { "content-type": "application/octet-stream" },
    };
  }

  async put(key: string, value: Uint8Array) {
    const data = value instanceof Uint8Array ? value : new Uint8Array(value);
    this.objects.set(key, {
      data,
      metadata: {},
      uploaded: new Date(),
    });

    return {
      key,
      version: "v1",
      size: data.length,
      etag: "etag",
      uploaded: new Date(),
    };
  }

  async delete(keys: string | string[]) {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    keyArray.forEach((key) => this.objects.delete(key));
  }

  async list(options?: { prefix?: string }) {
    const prefix = options?.prefix;
    const objects = Array.from(this.objects.entries())
      .filter(([key]) => !prefix || key.startsWith(prefix))
      .map(([key, obj]) => ({
        key,
        version: "v1",
        size: obj.data.length,
        etag: "etag",
        uploaded: obj.uploaded,
      }));

    return {
      objects,
      delimitedPrefixes: [],
      isTruncated: false,
    };
  }

  getObjects() {
    return this.objects;
  }
}

describe("CloudflareArtifactStoreAdapter", () => {
  let adapter: CloudflareArtifactStoreAdapter;
  let mockBucket: MockR2Bucket;

  beforeEach(() => {
    mockBucket = new MockR2Bucket();
    adapter = new CloudflareArtifactStoreAdapter(mockBucket as any);
  });

  describe("upload", () => {
    it("should upload artifact and return metadata", async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const metadata = await adapter.upload({
        sessionId: "session-1",
        contentType: "application/octet-stream",
        data,
      });

      expect(metadata.id).toBeDefined();
      expect(metadata.sessionId).toBe("session-1");
      expect(metadata.contentType).toBe("application/octet-stream");
      expect(metadata.size).toBe(5);
      expect(metadata.createdAt).toBeGreaterThan(0);
    });

    it("should include custom metadata", async () => {
      const data = new Uint8Array([1, 2, 3]);
      await adapter.upload({
        sessionId: "session-2",
        contentType: "text/plain",
        data,
        metadata: { author: "test", version: "1" },
      });

      expect(mockBucket.getObjects().size).toBe(1);
    });

    it("should generate unique IDs for different uploads", async () => {
      const data = new Uint8Array([1, 2, 3]);

      const meta1 = await adapter.upload({
        sessionId: "session-3",
        contentType: "text/plain",
        data,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const meta2 = await adapter.upload({
        sessionId: "session-3",
        contentType: "text/plain",
        data,
      });

      expect(meta1.id).not.toBe(meta2.id);
    });
  });

  describe("download", () => {
    it("should download artifact by ID", async () => {
      const originalData = new Uint8Array([1, 2, 3, 4, 5]);
      const uploadMeta = await adapter.upload({
        sessionId: "session-4",
        contentType: "application/octet-stream",
        data: originalData,
      });

      const downloaded = await adapter.download(uploadMeta.id, "session-4");

      expect(downloaded).toEqual(originalData);
    });

    it("should prevent cross-session access", async () => {
      const data = new Uint8Array([1, 2, 3]);
      const uploadMeta = await adapter.upload({
        sessionId: "session-5",
        contentType: "text/plain",
        data,
      });

      // Try to download from different session
      const downloaded = await adapter.download(uploadMeta.id, "session-999");

      expect(downloaded).toBeNull();
    });

    it("should return null for missing artifact", async () => {
      const downloaded = await adapter.download("artifacts/session-6/fake.txt", "session-6");
      expect(downloaded).toBeNull();
    });
  });

  describe("getMetadata", () => {
    it("should retrieve artifact metadata", async () => {
      const data = new Uint8Array([1, 2, 3]);
      const uploadMeta = await adapter.upload({
        sessionId: "session-7",
        contentType: "application/pdf",
        data,
      });

      const retrieved = await adapter.getMetadata(uploadMeta.id, "session-7");

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(uploadMeta.id);
      expect(retrieved?.sessionId).toBe("session-7");
      expect(retrieved?.contentType).toBe("application/pdf");
      expect(retrieved?.size).toBe(3);
    });

    it("should prevent cross-session metadata access", async () => {
      const data = new Uint8Array([1, 2, 3]);
      const uploadMeta = await adapter.upload({
        sessionId: "session-8",
        contentType: "text/plain",
        data,
      });

      const retrieved = await adapter.getMetadata(uploadMeta.id, "session-999");
      expect(retrieved).toBeNull();
    });

    it("should return null for missing artifact", async () => {
      const retrieved = await adapter.getMetadata("fake-id", "session-9");
      expect(retrieved).toBeNull();
    });
  });

  describe("list", () => {
    it("should list artifacts for session", async () => {
      const data = new Uint8Array([1, 2, 3]);

      const meta1 = await adapter.upload({
        sessionId: "session-10",
        contentType: "text/plain",
        data,
      });

      const meta2 = await adapter.upload({
        sessionId: "session-10",
        contentType: "application/json",
        data,
      });

      const list = await adapter.list("session-10");

      expect(list).toHaveLength(2);
      expect(list.map((m) => m.id)).toContain(meta1.id);
      expect(list.map((m) => m.id)).toContain(meta2.id);
    });

    it("should not list artifacts from other sessions", async () => {
      const data = new Uint8Array([1, 2, 3]);

      await adapter.upload({
        sessionId: "session-11",
        contentType: "text/plain",
        data,
      });

      const list = await adapter.list("session-999");
      expect(list).toHaveLength(0);
    });

    it("should return empty list for new session", async () => {
      const list = await adapter.list("session-new");
      expect(list).toEqual([]);
    });
  });

  describe("delete", () => {
    it("should delete artifact by ID", async () => {
      const data = new Uint8Array([1, 2, 3]);
      const uploadMeta = await adapter.upload({
        sessionId: "session-12",
        contentType: "text/plain",
        data,
      });

      const deleted = await adapter.delete(uploadMeta.id, "session-12");
      expect(deleted).toBe(true);

      const retrieved = await adapter.getMetadata(uploadMeta.id, "session-12");
      expect(retrieved).toBeNull();
    });

    it("should prevent cross-session deletion", async () => {
      const data = new Uint8Array([1, 2, 3]);
      const uploadMeta = await adapter.upload({
        sessionId: "session-13",
        contentType: "text/plain",
        data,
      });

      const deleted = await adapter.delete(uploadMeta.id, "session-999");
      expect(deleted).toBe(false);

      // Original should still exist
      const retrieved = await adapter.getMetadata(uploadMeta.id, "session-13");
      expect(retrieved).toBeDefined();
    });

    it("should return false for missing artifact", async () => {
      const deleted = await adapter.delete("fake-id", "session-14");
      expect(deleted).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("should not throw on cleanup", async () => {
      const data = new Uint8Array([1, 2, 3]);
      await adapter.upload({
        sessionId: "session-15",
        contentType: "text/plain",
        data,
      });

      // Should not throw
      const result = await adapter.cleanup("session-15");
      expect(result).toBe(0); // No-op in current implementation
    });

    it("should handle cleanup for all sessions", async () => {
      const result = await adapter.cleanup();
      expect(result).toBe(0);
    });
  });

  describe("session isolation", () => {
    it("should maintain complete session isolation", async () => {
      const data = new Uint8Array([1, 2, 3]);

      // Upload to session A
      const metaA = await adapter.upload({
        sessionId: "session-a",
        contentType: "text/plain",
        data,
      });

      // Upload to session B
      const metaB = await adapter.upload({
        sessionId: "session-b",
        contentType: "text/plain",
        data,
      });

      // Session A can only see its own
      const listA = await adapter.list("session-a");
      expect(listA).toHaveLength(1);
      expect(listA[0].id).toBe(metaA.id);

      // Session B can only see its own
      const listB = await adapter.list("session-b");
      expect(listB).toHaveLength(1);
      expect(listB[0].id).toBe(metaB.id);

      // Cross-session operations fail
      expect(await adapter.download(metaA.id, "session-b")).toBeNull();
      expect(await adapter.delete(metaA.id, "session-b")).toBe(false);
    });
  });
});
