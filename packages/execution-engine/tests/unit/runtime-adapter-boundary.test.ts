import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const FORBIDDEN_ADAPTER_TOKENS = ["OpenAIAdapter", "LocalMockAdapter"];
const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+["'][^"']*\/adapters\/OpenAIAdapter(\.js)?["']/,
  /from\s+["'][^"']*\/adapters\/LocalMockAdapter(\.js)?["']/,
];

describe("runtime adapter boundary guard", () => {
  it("prevents provider-specific adapter usage inside runtime modules", () => {
    const runtimeRoot = join(process.cwd(), "src/runtime");
    const runtimeFiles = collectTypeScriptFiles(runtimeRoot).filter(
      (filePath) => !filePath.endsWith(".test.ts"),
    );
    const violations: string[] = [];

    for (const filePath of runtimeFiles) {
      const content = readFileSync(filePath, "utf8");
      const relativePath = relative(process.cwd(), filePath);

      for (const token of FORBIDDEN_ADAPTER_TOKENS) {
        if (content.includes(token)) {
          violations.push(`${relativePath}: contains forbidden token "${token}"`);
        }
      }

      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(
            `${relativePath}: matches forbidden adapter import pattern ${pattern.source}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

function collectTypeScriptFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(fullPath));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}
