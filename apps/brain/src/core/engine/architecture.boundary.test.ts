import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = path.resolve(process.cwd(), "src");
const ALLOWED_IMPORT_PREFIXES = ["core/engine/", "core/llm/", "runtime/"];
const AI_SERVICE_IMPORT_PATTERNS = [
  /from\s+["'][^"']*services\/AIService["']/,
  /import\(\s*["'][^"']*services\/AIService["']\s*\)/,
];

describe("architecture boundary", () => {
  it("restricts AIService imports to runtime engine/llm modules", () => {
    const sourceFiles = listSourceFiles(SOURCE_ROOT);
    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const relativePath = normalizeRelativePath(filePath);
      if (shouldSkipBoundaryCheck(relativePath)) {
        continue;
      }

      if (!containsAiServiceImport(filePath)) {
        continue;
      }

      const isAllowedPath = ALLOWED_IMPORT_PREFIXES.some((prefix) =>
        relativePath.startsWith(prefix),
      );
      if (!isAllowedPath) {
        violations.push(relativePath);
      }
    }

    expect(
      violations,
      `AIService import boundary violated in: ${violations.join(", ")}`,
    ).toEqual([]);
  });
});

function listSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && absolutePath.endsWith(".ts")) {
      files.push(absolutePath);
    }
  }

  return files;
}

function normalizeRelativePath(filePath: string): string {
  return path.relative(SOURCE_ROOT, filePath).split(path.sep).join("/");
}

function shouldSkipBoundaryCheck(relativePath: string): boolean {
  if (relativePath.endsWith(".test.ts")) {
    return true;
  }
  if (relativePath === "services/AIService.ts") {
    return true;
  }
  return false;
}

function containsAiServiceImport(filePath: string): boolean {
  const content = readFileSync(filePath, "utf8");
  return AI_SERVICE_IMPORT_PATTERNS.some((pattern) => pattern.test(content));
}
