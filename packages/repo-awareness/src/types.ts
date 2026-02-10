/**
 * Repo Awareness Types
 *
 * Pure type definitions for repository structure analysis
 */

/**
 * File classification categories
 */
export enum FileKind {
  SOURCE = "SOURCE",
  TEST = "TEST",
  DOC = "DOC",
  CONFIG = "CONFIG",
  DB = "DB",
  TOOLING = "TOOLING",
  OTHER = "OTHER",
}

/**
 * Metadata for a single file (no content)
 */
export interface RepoFileMeta {
  /** Relative path from repo root */
  path: string;
  /** File extension (e.g., "ts", "md", "json") */
  ext: string;
  /** File size in bytes */
  size: number;
  /** Lines of code (optional, expensive to compute) */
  loc?: number;
  /** Last modified timestamp (ISO string) */
  lastModified?: string;
  /** Classified file kind */
  kind: FileKind;
  /** Importance score 0-1 */
  importance: number;
}

/**
 * Summary of repository structure
 */
export interface RepoSummary {
  /** Repository root path */
  rootPath: string;
  /** Scan timestamp (ISO string) */
  scannedAt: string;
  /** Total files scanned */
  totalFiles: number;
  /** Files by kind */
  byKind: Record<FileKind, number>;
  /** Top N largest files */
  largestFiles: RepoFileMeta[];
  /** Entry point files (main.ts, index.ts, etc.) */
  entryPoints: RepoFileMeta[];
  /** Most important files by heuristic score */
  importantFiles: RepoFileMeta[];
  /** All scanned files (metadata only) */
  allFiles: RepoFileMeta[];
}

/**
 * Options for repository scanning
 */
export interface ScanOptions {
  /** Root directory to scan */
  rootPath: string;
  /** Patterns to exclude (glob patterns) */
  excludePatterns?: string[];
  /** Whether to respect .gitignore */
  respectGitignore?: boolean;
  /** Max files to process (safety limit) */
  maxFiles?: number;
  /** Include .loc calculation (slower) */
  calculateLoc?: boolean;
}
