/**
 * RepoScanner - Walks file system and collects file metadata
 *
 * Single responsibility: Scan directory and extract file metadata
 * No file contents loaded - only metadata (size, mtime, path)
 */
import { readdirSync, statSync, readFileSync } from "fs";
import { join, relative, extname } from "path";
import type { RepoFileMeta, ScanOptions } from "../types.js";
import { FileClassifier } from "./FileClassifier.js";
import { PathMatcher } from "./PathMatcher.js";
import { ImportanceScorer } from "../analyzer/ImportanceScorer.js";

/**
 * Scan repository and collect file metadata
 */
export class RepoScanner {
  private options: Required<ScanOptions>;
  private pathMatcher: PathMatcher;
  private scannedCount = 0;

  constructor(options: ScanOptions) {
    this.options = {
      rootPath: options.rootPath,
      excludePatterns: options.excludePatterns ?? [],
      respectGitignore: options.respectGitignore ?? true,
      maxFiles: options.maxFiles ?? 10000,
      calculateLoc: options.calculateLoc ?? false,
    };

    this.pathMatcher = new PathMatcher(
      this.options.rootPath,
      this.options.excludePatterns,
    );
  }

  /**
   * Scan repository and return file metadata
   */
  async scan(): Promise<RepoFileMeta[]> {
    this.scannedCount = 0;
    const files: RepoFileMeta[] = [];

    try {
      this.walkDirectory(this.options.rootPath, "", files);
    } catch (error) {
      console.error(`[repo-scanner] Error scanning ${this.options.rootPath}:`, error);
      // Continue with partial results
    }

    return files;
  }

  /**
   * Recursively walk directory and collect file metadata
   */
  private walkDirectory(
    currentPath: string,
    relativePath: string,
    files: RepoFileMeta[],
  ): void {
    // Safety check: stop if we've exceeded max files
    if (this.scannedCount >= this.options.maxFiles) {
      return;
    }

    try {
      const entries = readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryRelativePath = relativePath
          ? `${relativePath}/${entry.name}`
          : entry.name;

        // Check if should ignore
        if (this.pathMatcher.shouldIgnore(entryRelativePath)) {
          continue;
        }

        const fullPath = join(currentPath, entry.name);

        if (entry.isDirectory()) {
          // Recurse into directory
          this.walkDirectory(fullPath, entryRelativePath, files);
        } else if (entry.isFile()) {
          // Process file
          this.scannedCount++;
          const fileMeta = this.getFileMeta(fullPath, entryRelativePath);
          if (fileMeta) {
            files.push(fileMeta);
          }

          if (this.scannedCount >= this.options.maxFiles) {
            break;
          }
        }
      }
    } catch (error) {
      console.error(`[repo-scanner] Error reading ${currentPath}:`, error);
      // Continue scanning other directories
    }
  }

  /**
   * Extract metadata for a single file
   */
  private getFileMeta(fullPath: string, relativePath: string): RepoFileMeta | null {
    try {
      const stat = statSync(fullPath);
      const ext = extname(relativePath).slice(1).toLowerCase();
      const kind = FileClassifier.classify(relativePath);

      const meta: RepoFileMeta = {
        path: relativePath,
        ext,
        size: stat.size,
        kind,
        importance: 0, // Will be calculated by ImportanceScorer
        lastModified: stat.mtime.toISOString(),
      };

      // Optionally calculate LOC
      if (this.options.calculateLoc && kind === "SOURCE") {
        try {
          meta.loc = this.countLines(fullPath);
        } catch {
          // If we can't count lines, just skip LOC
        }
      }

      // Calculate importance after setting kind
      meta.importance = ImportanceScorer.score(meta);

      return meta;
    } catch (error) {
      console.error(`[repo-scanner] Error getting metadata for ${fullPath}:`, error);
      return null;
    }
  }

  /**
   * Count lines in a file (text files only)
   */
  private countLines(filePath: string): number {
    try {
      const content = readFileSync(filePath, "utf-8");
      return content.split("\n").length;
    } catch {
      return 0;
    }
  }
}
