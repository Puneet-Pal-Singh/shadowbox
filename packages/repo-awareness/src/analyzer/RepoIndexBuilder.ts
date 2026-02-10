/**
 * RepoIndexBuilder - Aggregates file metadata into RepoSummary
 *
 * Single responsibility: Build summary index from classified files
 * No side effects, deterministic aggregation
 */
import type { RepoFileMeta, RepoSummary, FileKind } from "../types.js";
import { FileKind as FileKindEnum } from "../types.js";

/**
 * Build repository index summary from file metadata
 */
export class RepoIndexBuilder {
  private files: RepoFileMeta[];
  private rootPath: string;

  constructor(files: RepoFileMeta[], rootPath: string = ".") {
    // Sort for deterministic output
    this.files = [...files].sort((a, b) => a.path.localeCompare(b.path));
    this.rootPath = rootPath;
  }

  /**
   * Build complete summary index
   */
  build(): RepoSummary {
    return {
      rootPath: this.rootPath,
      scannedAt: new Date().toISOString(),
      totalFiles: this.files.length,
      byKind: this.getByKind(),
      largestFiles: this.getLargestFiles(10),
      entryPoints: this.getEntryPoints(),
      importantFiles: this.getImportantFiles(20),
      allFiles: this.files,
    };
  }

  /**
   * Count files by kind
   */
  private getByKind(): Record<FileKind, number> {
    const counts: Record<FileKind, number> = {
      [FileKindEnum.SOURCE]: 0,
      [FileKindEnum.TEST]: 0,
      [FileKindEnum.DOC]: 0,
      [FileKindEnum.CONFIG]: 0,
      [FileKindEnum.DB]: 0,
      [FileKindEnum.TOOLING]: 0,
      [FileKindEnum.OTHER]: 0,
    };

    for (const file of this.files) {
      counts[file.kind]++;
    }

    return counts;
  }

  /**
   * Get top N largest files
   */
  private getLargestFiles(n: number): RepoFileMeta[] {
    return [...this.files]
      .sort((a, b) => b.size - a.size)
      .slice(0, n);
  }

  /**
   * Get entry point files
   */
  private getEntryPoints(): RepoFileMeta[] {
    return this.files.filter(
      (f) =>
        ["main.ts", "index.ts", "app.ts", "server.ts"].includes(
          f.path.split("/").pop() || "",
        ) || /\bcmd\//.test(f.path),
    );
  }

  /**
   * Get most important files by score
   */
  private getImportantFiles(n: number): RepoFileMeta[] {
    return [...this.files]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, n);
  }
}
