import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SOURCE_ROOT = join(process.cwd(), "src");
const SDK_BOUNDARY_FILE = "services/api/providerClient.ts";
const BLOCKED_BYOK_PATH_PATTERN = /\/api\/byok(?:\/|$)/;

describe("Architecture Boundary: BYOK SDK transport ownership", () => {
  it("blocks direct /api/byok usage outside providerClient SDK boundary", () => {
    const violations = collectSourceFiles(SOURCE_ROOT)
      .filter((filePath) => !isAllowedSdkBoundaryFile(filePath))
      .filter((filePath) => containsBlockedByokPath(filePath))
      .map((filePath) => relative(SOURCE_ROOT, filePath));

    expect(violations).toEqual([]);
  });
});

function collectSourceFiles(root: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(root);
  for (const entry of entries) {
    const fullPath = join(root, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (!isSourceFile(fullPath) || isTestFile(fullPath)) {
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function isSourceFile(filePath: string): boolean {
  return (
    filePath.endsWith(".ts") ||
    filePath.endsWith(".tsx") ||
    filePath.endsWith(".js") ||
    filePath.endsWith(".jsx")
  );
}

function isTestFile(filePath: string): boolean {
  return filePath.includes(".test.");
}

function isAllowedSdkBoundaryFile(filePath: string): boolean {
  return relative(SOURCE_ROOT, filePath) === SDK_BOUNDARY_FILE;
}

function containsBlockedByokPath(filePath: string): boolean {
  const source = readFileSync(filePath, "utf8");
  return BLOCKED_BYOK_PATH_PATTERN.test(source);
}
