/**
 * FileClassifier - Pure path-based file classification
 *
 * Single responsibility: Classify files by path and extension
 * No side effects, no file system access
 */
import { FileKind } from "../types.js";

const TEST_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /\b(test|tests|__tests__)\//,
];

const DOC_PATTERNS = [
  /^README/i,
  /\.md$/i,
  /\bdocs?\//,
  /^CHANGELOG/i,
  /^CONTRIBUTING/i,
  /^LICENSE/i,
];

const DB_PATTERNS = [
  /\b(migrations|schema)\//,
  /\.sql$/i,
];

const TOOLING_PATTERNS = [
  /\b(scripts|tools)\//,
  /^Makefile/i,
  /\.sh$/,
  /\.bash$/,
];

const CONFIG_PATTERNS = [
  /^package\.json$/,
  /^tsconfig/,
  /^jest\.config/,
  /^vitest/,
  /^webpack\.config/,
  /\.config\./,
  /^\..*rc$/,
  /^Dockerfile/i,
  /^\.env/,
  /^docker-compose/,
  /^\.github\//,
];

const SOURCE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "go",
  "py",
  "java",
  "kotlin",
  "rs",
  "cpp",
  "c",
  "h",
  "swift",
  "rb",
  "php",
  "scala",
  "clj",
]);

/**
 * Classify files by path and extension
 */
export class FileClassifier {
  /**
   * Classify a file based on its path
   */
  static classify(path: string): FileKind {
    // Exact priority order matters
    if (this.matchesPattern(path, TEST_PATTERNS)) {
      return FileKind.TEST;
    }

    if (this.matchesPattern(path, DOC_PATTERNS)) {
      return FileKind.DOC;
    }

    if (this.matchesPattern(path, DB_PATTERNS)) {
      return FileKind.DB;
    }

    if (this.matchesPattern(path, TOOLING_PATTERNS)) {
      return FileKind.TOOLING;
    }

    if (this.matchesPattern(path, CONFIG_PATTERNS)) {
      return FileKind.CONFIG;
    }

    if (this.isSourceFile(path)) {
      return FileKind.SOURCE;
    }

    return FileKind.OTHER;
  }

  /**
   * Check if file is a known entry point
   */
  static isEntryPoint(path: string): boolean {
    const fileName = path.split("/").pop() || "";
    const entryPointNames = ["main.ts", "index.ts", "app.ts", "server.ts"];

    if (entryPointNames.includes(fileName)) {
      return true;
    }

    // Check for cmd/* pattern (Go convention)
    if (/\bcmd\//.test(path)) {
      return true;
    }

    return false;
  }

  /**
   * Get priority weight for kind (used in sorting)
   */
  static getKindWeight(kind: FileKind): number {
    const weights: Record<FileKind, number> = {
      [FileKind.SOURCE]: 5,
      [FileKind.CONFIG]: 4,
      [FileKind.DOC]: 3,
      [FileKind.TOOLING]: 2,
      [FileKind.DB]: 2,
      [FileKind.TEST]: 1,
      [FileKind.OTHER]: 0,
    };
    return weights[kind];
  }

  /**
   * Check if path matches any pattern
   */
  private static matchesPattern(path: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(path));
  }

  /**
   * Check if file is a source code file by extension
   */
  private static isSourceFile(path: string): boolean {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    return SOURCE_EXTENSIONS.has(ext);
  }
}
