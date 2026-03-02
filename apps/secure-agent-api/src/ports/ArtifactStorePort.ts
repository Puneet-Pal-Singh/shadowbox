/**
 * ArtifactStorePort - Boundary for artifact and file persistence.
 *
 * Abstracts artifact storage (R2, S3, file system, etc.)
 * from the core agent runtime logic.
 *
 * Canonical alignment: ArtifactStorePort (Charter 46)
 */

export interface ArtifactMetadata {
  id: string;
  sessionId: string;
  contentType: string;
  size: number;
  createdAt: number;
  expiresAt?: number;
}

export interface ArtifactUploadInput {
  sessionId: string;
  contentType: string;
  data: Uint8Array;
  metadata?: Record<string, string>;
}

/**
 * Port for artifact and large file storage.
 * Abstracts object storage platform (R2, S3, file system, etc.)
 */
export interface ArtifactStorePort {
  /**
   * Upload an artifact.
   *
   * @param input - Upload input with content and metadata
   * @returns Artifact metadata with assigned ID
   */
  upload(input: ArtifactUploadInput): Promise<ArtifactMetadata>;

  /**
   * Download an artifact.
   *
   * @param id - Artifact identifier
   * @param sessionId - Session identifier (for scoping)
   * @returns Artifact content as Uint8Array or null if not found
   */
  download(id: string, sessionId: string): Promise<Uint8Array | null>;

  /**
   * Get artifact metadata without downloading content.
   *
   * @param id - Artifact identifier
   * @param sessionId - Session identifier
   * @returns Artifact metadata or null if not found
   */
  getMetadata(id: string, sessionId: string): Promise<ArtifactMetadata | null>;

  /**
   * List artifacts for a session.
   *
   * @param sessionId - Session identifier
   * @returns Array of artifact metadata
   */
  list(sessionId: string): Promise<ArtifactMetadata[]>;

  /**
   * Delete an artifact.
   *
   * @param id - Artifact identifier
   * @param sessionId - Session identifier
   * @returns true if deletion was successful
   */
  delete(id: string, sessionId: string): Promise<boolean>;

  /**
   * Clean up expired artifacts.
   *
   * @param sessionId - Session identifier (optional, cleanup all if not provided)
   * @returns Number of artifacts cleaned up
   */
  cleanup(sessionId?: string): Promise<number>;
}
