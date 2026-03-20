/**
 * Workspace Metadata Store Interface
 *
 * Focused interface for workspace-level BYOK metadata.
 * Stores credential labels and per-workspace BYOK UI metadata.
 */

export interface WorkspaceByokMetadata {
  credentialLabelsJson: string; // JSON object { providerId: label }
  additionalMetadataJson?: string;
}

export interface WorkspaceMetadataStore {
  /**
   * Get workspace BYOK metadata
   */
  getWorkspaceMetadata(): Promise<WorkspaceByokMetadata>;

  /**
   * Update workspace BYOK metadata
   */
  updateWorkspaceMetadata(metadata: WorkspaceByokMetadata): Promise<void>;
}
