/**
 * Git Types - Shared types for git operations across Shadowbox apps
 * Used by Web, Brain, and Muscle layers
 */

export type FileStatusType =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked";

export interface FileStatus {
  path: string;
  status: FileStatusType;
  additions: number;
  deletions: number;
  isStaged: boolean;
}

export interface DiffLine {
  type: "unchanged" | "added" | "deleted";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
  header: string;
}

export interface DiffContent {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
  isBinary: boolean;
  isNewFile: boolean;
  isDeleted: boolean;
}

export interface CommitPayload {
  message: string;
  files?: string[];
}

export interface GitStatusResponse {
  files: FileStatus[];
  ahead: number;
  behind: number;
  branch: string;
  hasStaged: boolean;
  hasUnstaged: boolean;
}

export interface GitDiffRequest {
  path?: string;
  staged?: boolean;
}

export interface StageFilesRequest {
  files: string[];
  unstage?: boolean;
}
