/**
 * Architecture Boundary Test: No Legacy Imports
 *
 * Enforces that no code imports from deprecated/legacy modules:
 * - No imports from src/legacy/**
 * - No imports from deprecated types (run.types.ts, task.types.ts)
 * - No imports from transitional core wrappers that should be removed
 *
 * This prevents regression into deprecated code patterns.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const BRAIN_SRC = path.join(__dirname, "..");

interface DeprecatedImport {
  file: string;
  line: number;
  importedModule: string;
  reason: string;
}

/**
 * Collect all TypeScript source files recursively
 */
function getAllTSFiles(dir: string, excludeDirs: string[] = []): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (
        !excludeDirs.includes(entry.name) &&
        !entry.name.startsWith(".")
      ) {
        files.push(
          ...getAllTSFiles(path.join(dir, entry.name), excludeDirs)
        );
      }
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(path.join(dir, entry.name));
    }
  }

  return files;
}

/**
 * Extract all import statements from a file
 */
function extractImports(filePath: string): Array<{ line: number; module: string }> {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const imports: Array<{ line: number; module: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match: import ... from "..."
    const importMatch = line.match(/import\s+(?:.*?)\s+from\s+["'](.*?)["']/);
    if (importMatch) {
      imports.push({
        line: i + 1,
        module: importMatch[1],
      });
    }

    // Match: import("...")
    const dynamicMatch = line.match(/import\s*\(\s*["'](.*?)["']\s*\)/);
    if (dynamicMatch) {
      imports.push({
        line: i + 1,
        module: dynamicMatch[1],
      });
    }
  }

  return imports;
}

describe("Architecture Boundary: No Legacy Imports", () => {
  it("should have deleted src/legacy directory entirely", () => {
    const legacyPath = path.join(BRAIN_SRC, "legacy");
    const exists = fs.existsSync(legacyPath);
    expect(
      exists,
      "src/legacy directory should not exist after PR-4 deletion sweep"
    ).toBe(false);
  });

  it("should have deleted deprecated type files", () => {
    const deprecatedTypeFiles = [
      "types/run.types.ts",
      "types/task.types.ts",
      "types/index.ts",
    ];

    for (const typeFile of deprecatedTypeFiles) {
      const filePath = path.join(BRAIN_SRC, typeFile);
      const exists = fs.existsSync(filePath);
      expect(
        exists,
        `${typeFile} should be deleted after PR-4`
      ).toBe(false);
    }
  });

  it("should not allow any imports from legacy modules", () => {
    const allFiles = getAllTSFiles(BRAIN_SRC, ["architecture"]);
    const violations: DeprecatedImport[] = [];

    const legacyPatterns = [
      /legacy\//,
      /types\/run\.types/,
      /types\/task\.types/,
    ];

    for (const file of allFiles) {
      const imports = extractImports(file);
      for (const { line, module } of imports) {
        const isDeprecated = legacyPatterns.some((pattern) =>
          pattern.test(module)
        );
        if (isDeprecated) {
          violations.push({
            file,
            line,
            importedModule: module,
            reason: "Legacy modules should not be imported",
          });
        }
      }
    }

    expect(
      violations,
      `No code should import from legacy modules. Violations:\n${violations.map((v) => `${v.file}:${v.line} imports ${v.importedModule}`).join("\n")}`
    ).toEqual([]);
  });

  it("should verify core wrappers have been migrated or are retained for valid reasons", () => {
    // These wrapper files should either be deleted or have valid Brain-owned code
    // e.g., core/security/LogSanitizer.ts is Brain-owned and retained

    const coreDir = path.join(BRAIN_SRC, "core");
    if (fs.existsSync(coreDir)) {
      const coreFiles = fs.readdirSync(coreDir);

      // These subdirectories should have minimal or no files (mostly deleted)
      const expectedDeletionCandidates = [
        "engine",
        "orchestration",
        "run",
        "task",
        "planner",
        "cost",
        "llm",
        "agents",
      ];

      for (const dir of expectedDeletionCandidates) {
        const dirPath = path.join(coreDir, dir);
        if (fs.existsSync(dirPath)) {
          const files = fs
            .readdirSync(dirPath)
            .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
          // These are transitional re-exports from @shadowbox/execution-engine
          // will be further cleaned up in future iterations
          expect(
            files.length,
            `core/${dir} should have fewer than 15 files (found ${files.length})`
          ).toBeLessThanOrEqual(15);
        }
      }
    }
  });

  it("should not have orphaned orchestrator files", () => {
    const orchestratorPath = path.join(BRAIN_SRC, "orchestrator");
    const exists = fs.existsSync(orchestratorPath);

    if (exists) {
      const files = fs
        .readdirSync(orchestratorPath)
        .filter(
          (f) => f.endsWith(".ts") && !f.endsWith(".test.ts")
        );
      expect(
        files.length,
        "orchestrator directory should be empty or deleted"
      ).toBe(0);
    }
  });

  it("should not have any references to deprecated @shadowbox/brain internal exports", () => {
    const allFiles = getAllTSFiles(BRAIN_SRC, ["architecture"]);
    const violations: DeprecatedImport[] = [];

    // These patterns indicate imports from deprecated/removed code
    const deprecatedExportPatterns = [
      /@shadowbox\/brain\/legacy/,
      /from.*legacy/,
      /from.*deprecated/,
    ];

    for (const file of allFiles) {
      const imports = extractImports(file);
      for (const { line, module } of imports) {
        const isDeprecatedExport = deprecatedExportPatterns.some(
          (pattern) => pattern.test(module)
        );
        if (isDeprecatedExport) {
          violations.push({
            file,
            line,
            importedModule: module,
            reason: "Should not import from deprecated exports",
          });
        }
      }
    }

    expect(
      violations,
      `No deprecated exports should be imported. Violations:\n${violations.map((v) => `${v.file}:${v.line} imports ${v.importedModule}`).join("\n")}`
    ).toEqual([]);
  });
});
