import type { SymbolKind, ChangeType } from "./context.js";

/**
 * Repository snapshot
 * Immutable representation of repo state
 */
export interface RepoSnapshot {
  /** Absolute path to repo root */
  root: string;

  /** File descriptors */
  files: FileDescriptor[];

  /** Optional symbol index */
  symbols?: SymbolIndex[];

  /** Optional git diffs */
  diffs?: GitDiff[];

  /** Repository metadata */
  metadata?: RepoMetadata;
}

/**
 * File descriptor (no content required)
 */
export interface FileDescriptor {
  /** Relative path from repo root */
  path: string;

  /** File size in bytes */
  size: number;

  /** Programming language */
  language?: string;

  /** Last modified timestamp (ms) */
  lastModified?: number;

  /** Optional: File content */
  content?: string;

  /** Optional: Relevance score 0-1 */
  relevanceScore?: number;
}

/**
 * Code symbol index entry
 */
export interface SymbolIndex {
  /** Symbol name */
  name: string;

  /** Symbol kind */
  kind: SymbolKind;

  /** Containing file */
  file: string;

  /** Line range [start, end] */
  range: [number, number];

  /** Optional documentation */
  documentation?: string;
}

/**
 * Git diff entry
 */
export interface GitDiff {
  /** File path */
  file: string;

  /** Patch content */
  patch: string;

  /** Change type */
  changeType?: ChangeType;

  /** Lines added */
  additions?: number;

  /** Lines deleted */
  deletions?: number;
}

/**
 * Repository metadata
 */
export interface RepoMetadata {
  /** Current branch */
  branch?: string;

  /** Current commit hash */
  commit?: string;

  /** Uncommitted changes flag */
  dirty?: boolean;

  /** Remote URL */
  remoteUrl?: string;
}
