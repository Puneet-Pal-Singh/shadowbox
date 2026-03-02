/**
 * CloudflareArtifactStoreAdapter - Implements ArtifactStorePort using R2.
 *
 * Adapts Cloudflare R2 (object storage) to the canonical ArtifactStorePort interface.
 * Encapsulates artifact upload, download, and lifecycle management.
 *
 * Canonical alignment: ArtifactStorePort (Charter 46)
 */

import {
  ArtifactStorePort,
  ArtifactMetadata,
  ArtifactUploadInput,
} from "../ports/ArtifactStorePort";

/**
 * Cloudflare R2 bucket interface.
 * Assumed to be available via environment binding.
 */
interface R2Object {
  key: string;
  version: string;
  size: number;
  etag: string;
  uploaded: Date;
  httpMetadata?: Record<string, string>;
  customMetadata?: Record<string, string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface R2Objects {
  objects: R2Object[];
  delimitedPrefixes?: string[];
  isTruncated: boolean;
  cursor?: string;
}

interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  get(key: string): Promise<R2Object | null>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | Uint8Array | string,
    options?: { httpMetadata?: Record<string, string> },
  ): Promise<R2Object>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: { prefix?: string }): Promise<R2Objects>;
}

/**
 * Generates a unique artifact key for storage.
 * Uses session ID and timestamp to ensure uniqueness and session isolation.
 */
function generateArtifactKey(sessionId: string, contentType: string): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 11);
  
  let extension = "bin";
  if (contentType.includes("/")) {
    const parts = contentType.split("/");
    const subtype = parts[1];
    if (subtype) {
      const basetype = subtype.split("+")[0];
      extension = basetype || "bin";
    }
  }
  
  return `artifacts/${sessionId}/${timestamp}-${randomId}.${extension}`;
}

/**
 * Extracts metadata from artifact ID (key).
 * Reverse of generateArtifactKey logic.
 */
function parseArtifactKey(key: string): { sessionId: string; name: string } | null {
  const match = key.match(/^artifacts\/([^/]+)\/(.+)$/);
  if (!match || !match[1] || !match[2]) return null;
  return { sessionId: match[1], name: match[2] };
}

export class CloudflareArtifactStoreAdapter implements ArtifactStorePort {
  constructor(private r2Bucket: R2Bucket) {}

  /**
   * Upload an artifact to R2 storage.
   * Returns metadata with assigned ID.
   */
  async upload(input: ArtifactUploadInput): Promise<ArtifactMetadata> {
    const key = generateArtifactKey(input.sessionId, input.contentType);
    
    // Store custom metadata in R2 object metadata
    const customMetadata: Record<string, string> = {
      sessionId: input.sessionId,
      uploadedAt: new Date().toISOString(),
      ...input.metadata,
    };

    const httpMetadata = {
      "content-type": input.contentType,
    };

    const r2Object = await this.r2Bucket.put(key, input.data, { httpMetadata });

    return {
      id: key,
      sessionId: input.sessionId,
      contentType: input.contentType,
      size: r2Object.size,
      createdAt: r2Object.uploaded.getTime(),
    };
  }

  /**
   * Download an artifact from R2 storage.
   * Returns artifact content as Uint8Array or null if not found.
   */
  async download(id: string, sessionId: string): Promise<Uint8Array | null> {
    // Validate session ownership (prevent cross-session access)
    const parsed = parseArtifactKey(id);
    if (!parsed || parsed.sessionId !== sessionId) {
      console.warn(
        `[ArtifactStore] Unauthorized download attempt: ${id} by session ${sessionId}`,
      );
      return null;
    }

    const r2Object = await this.r2Bucket.get(id);
    if (!r2Object) {
      return null;
    }

    // Convert to Uint8Array
    const buffer = await r2Object.arrayBuffer();
    return new Uint8Array(buffer);
  }

  /**
   * Get artifact metadata without downloading content.
   * Returns metadata or null if not found.
   */
  async getMetadata(
    id: string,
    sessionId: string,
  ): Promise<ArtifactMetadata | null> {
    // Validate session ownership
    const parsed = parseArtifactKey(id);
    if (!parsed || parsed.sessionId !== sessionId) {
      return null;
    }

    const r2Object = await this.r2Bucket.head(id);
    if (!r2Object) {
      return null;
    }

    // Extract content type from metadata if available
    const contentType =
      (r2Object.httpMetadata && r2Object.httpMetadata["content-type"]) ||
      "application/octet-stream";

    return {
      id,
      sessionId,
      contentType,
      size: r2Object.size,
      createdAt: r2Object.uploaded.getTime(),
    };
  }

  /**
   * List artifacts for a session.
   * Returns array of artifact metadata.
   */
  async list(sessionId: string): Promise<ArtifactMetadata[]> {
    const prefix = `artifacts/${sessionId}/`;
    const result = await this.r2Bucket.list({ prefix });

    return result.objects.map((obj) => ({
      id: obj.key,
      sessionId,
      contentType:
        (obj.httpMetadata && obj.httpMetadata["content-type"]) ||
        "application/octet-stream",
      size: obj.size,
      createdAt: obj.uploaded.getTime(),
    }));
  }

  /**
   * Delete an artifact from storage.
   * Returns true if deletion was successful.
   */
  async delete(id: string, sessionId: string): Promise<boolean> {
    // Validate session ownership
    const parsed = parseArtifactKey(id);
    if (!parsed || parsed.sessionId !== sessionId) {
      return false;
    }

    try {
      await this.r2Bucket.delete(id);
      return true;
    } catch {
      console.error(`[ArtifactStore] Failed to delete artifact: ${id}`);
      return false;
    }
  }

  /**
   * Clean up expired artifacts.
   * For now, we keep all artifacts. Expiration can be implemented via
   * lifecycle policies or background jobs.
   */
  async cleanup(sessionId?: string): Promise<number> {
    // This is a no-op in the current implementation.
    // Cloudflare R2 lifecycle policies or separate background jobs
    // would handle expiration-based cleanup.
    //
    // In production, you would:
    // 1. List all artifacts for the session (or all if sessionId not provided)
    // 2. Check expiresAt timestamps
    // 3. Delete expired items
    // 4. Return count of deleted items
    
    console.log(
      `[ArtifactStore] Cleanup requested for session: ${sessionId ?? "all"}`,
    );
    return 0;
  }
}
