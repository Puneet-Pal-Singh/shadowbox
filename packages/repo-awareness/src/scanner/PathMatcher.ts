/**
 * PathMatcher - Matches paths against ignore patterns and .gitignore
 *
 * Single responsibility: Determine if a path should be ignored
 */
import { minimatch } from "minimatch";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_IGNORE_PATTERNS = [
  "node_modules/**",
  ".git/**",
  ".next/**",
  "dist/**",
  "build/**",
  "coverage/**",
  ".turbo/**",
  "*.tsbuildinfo",
  ".DS_Store",
  "Thumbs.db",
];

/**
 * Match paths against ignore patterns
 */
export class PathMatcher {
  private patterns: string[] = [];
  private rootPath: string;

  constructor(rootPath: string, customPatterns?: string[]) {
    this.rootPath = rootPath;
    this.patterns = [...DEFAULT_IGNORE_PATTERNS];

    // Load and merge .gitignore patterns
    try {
      const gitignorePath = join(rootPath, ".gitignore");
      const gitignoreContent = readFileSync(gitignorePath, "utf-8");
      const gitignorePatterns = gitignoreContent
        .split("\n")
        .filter((line) => line.trim() && !line.startsWith("#"))
        .map((line) => line.trim());
      this.patterns.push(...gitignorePatterns);
    } catch {
      // .gitignore doesn't exist or can't be read, that's fine
    }

    // Add custom patterns
    if (customPatterns) {
      this.patterns.push(...customPatterns);
    }
  }

  /**
   * Check if path should be ignored
   */
  shouldIgnore(relativePath: string): boolean {
    // Normalize path separators
    const normalized = relativePath.replace(/\\/g, "/");

    // Check against all patterns
    for (const pattern of this.patterns) {
      // Handle negation patterns
      if (pattern.startsWith("!")) {
        const negatePattern = pattern.slice(1);
        if (minimatch(normalized, negatePattern)) {
          return false;
        }
      } else if (minimatch(normalized, pattern, { dot: true })) {
        return true;
      }
    }

    return false;
  }
}
