/**
 * Architecture Boundary Test: Layering Constraints
 *
 * Enforces strict import boundaries between application layers:
 * - Controllers cannot import infrastructure adapters directly
 * - Controllers can only import from http/, application/, and domain/
 * - Application layer cannot import from controllers/
 * - Domain layer has no external dependencies
 *
 * These tests prevent architectural regressions.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const BRAIN_SRC = path.join(__dirname, "..");

interface ImportViolation {
  file: string;
  line: number;
  importedModule: string;
  reason: string;
}

/**
 * Collect all TypeScript source files recursively
 *
 * Note: Test files (*.test.ts) are excluded from architectural analysis.
 * Test files are not subject to layering constraints as they need full
 * access to all modules for testing purposes.
 */
function getAllTSFiles(dir: string, excludeDirs: string[] = []): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!excludeDirs.includes(entry.name) && !entry.name.startsWith(".")) {
        files.push(...getAllTSFiles(path.join(dir, entry.name), excludeDirs));
      }
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts")
    ) {
      files.push(path.join(dir, entry.name));
    }
  }

  return files;
}

/**
 * Extract all import statements from a file
 */
function extractImports(
  filePath: string,
): Array<{ line: number; module: string }> {
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

describe("Architecture Boundary: Layering Constraints", () => {
  it("should prevent controllers from importing infrastructure adapters", () => {
    const controllerFiles = getAllTSFiles(path.join(BRAIN_SRC, "controllers"));
    const violations: ImportViolation[] = [];

    const forbiddenInfraPatterns = [
      /^\.\.\/services\/providers\/[A-Z]/,
      /^\.\.\/services\/ai\//,
      /services\/providers\/(Durable|KV)/,
    ];

    for (const file of controllerFiles) {
      const imports = extractImports(file);
      for (const { line, module } of imports) {
        const isForbidden = forbiddenInfraPatterns.some((pattern) =>
          pattern.test(module),
        );
        if (isForbidden) {
          violations.push({
            file,
            line,
            importedModule: module,
            reason: `Controllers must import only from http/, application/, and domain/ layers`,
          });
        }
      }
    }

    expect(
      violations,
      `Controllers should not import infra adapters. Violations: ${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });

  it("should prevent application layer from importing from controllers", () => {
    const appFiles = getAllTSFiles(path.join(BRAIN_SRC, "application"));
    const violations: ImportViolation[] = [];

    for (const file of appFiles) {
      const imports = extractImports(file);
      for (const { line, module } of imports) {
        if (module.includes("controllers")) {
          violations.push({
            file,
            line,
            importedModule: module,
            reason: "Application layer must not import from controllers",
          });
        }
      }
    }

    expect(
      violations,
      `Application layer should not import from controllers. Violations: ${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });

  it("should ensure domain errors are exported from domain/errors", () => {
    const errorsFile = path.join(BRAIN_SRC, "domain", "errors.ts");
    expect(fs.existsSync(errorsFile)).toBe(true);

    const content = fs.readFileSync(errorsFile, "utf-8");
    const requiredExports = [
      "ValidationError",
      "DomainError",
      "PolicyError",
      "DependencyError",
      "ProviderError",
      "isDomainError",
      "mapDomainErrorToHttp",
    ];

    for (const exportName of requiredExports) {
      const hasExport =
        content.includes(`export class ${exportName}`) ||
        content.includes(`export function ${exportName}`) ||
        content.includes(`export const ${exportName}`);

      expect(hasExport, `domain/errors.ts should export ${exportName}`).toBe(
        true,
      );
    }
  });

  it("should verify http layer has shared response and validation helpers", () => {
    const httpDir = path.join(BRAIN_SRC, "http");
    expect(fs.existsSync(httpDir)).toBe(true);

    const requiredFiles = ["response.ts", "validation.ts"];
    for (const file of requiredFiles) {
      const filePath = path.join(httpDir, file);
      expect(fs.existsSync(filePath), `http/${file} should exist`).toBe(true);
    }
  });

  it("should ensure no cross-layer circular imports", () => {
    const layers = [
      { name: "controllers", path: "controllers" },
      { name: "application", path: "application" },
      { name: "domain", path: "domain" },
      { name: "http", path: "http" },
    ];

    const layerImports: Record<string, Set<string>> = {};

    for (const layer of layers) {
      layerImports[layer.name] = new Set<string>();
      const layerPath = path.join(BRAIN_SRC, layer.path);

      // Skip http layer if it doesn't exist as a directory (it's typically files in src/)
      if (!fs.existsSync(layerPath)) {
        continue;
      }

      const files = getAllTSFiles(layerPath);

      for (const file of files) {
        const imports = extractImports(file);
        for (const { module } of imports) {
          for (const otherLayer of layers) {
            if (
              otherLayer.name !== layer.name &&
              module.includes(`/${otherLayer.path}/`)
            ) {
              layerImports[layer.name].add(`${layer.name}->${otherLayer.name}`);
            }
          }
        }
      }
    }

    // Verify only allowed directions
    // Controllers can import from: application, domain, http
    // Application can import from: domain, http
    // Domain can import from: nothing else
    // HTTP can import from: domain (for types)

    const controllerImports = Array.from(layerImports["controllers"] || []);
    const forbiddenControllerImports = controllerImports.filter(
      (imp) =>
        !imp.includes("->application") &&
        !imp.includes("->domain") &&
        !imp.includes("->http"),
    );

    const applicationImports = Array.from(layerImports["application"] || []);
    const forbiddenAppImports = applicationImports.filter(
      (imp) => !imp.includes("->domain") && !imp.includes("->http"),
    );

    expect(
      forbiddenControllerImports,
      "Controllers should only import from application, domain, http",
    ).toEqual([]);

    expect(
      forbiddenAppImports,
      "Application should only import from domain, http",
    ).toEqual([]);

    // Enforce domain layer constraints
    const domainImports = Array.from(layerImports["domain"] || []);
    expect(
      domainImports,
      "Domain should not import from any other layer",
    ).toEqual([]);

    // Enforce HTTP layer constraints
    const httpImports = Array.from(layerImports["http"] || []);
    const forbiddenHttpImports = httpImports.filter(
      (imp) => !imp.includes("->domain"),
    );
    expect(forbiddenHttpImports, "HTTP should only import from domain").toEqual(
      [],
    );
  });

  it("should enforce file size limits for critical runtime files", () => {
    const fileLimits: Record<
      string,
      { current: number; target: number; threshold: number }
    > = {
      "services/AIService.ts": { current: 268, target: 220, threshold: 280 },
      "controllers/ChatController.ts": {
        current: 310,
        target: 180,
        threshold: 320,
      },
    };

    const violations: string[] = [];

    for (const [relativePath, limits] of Object.entries(fileLimits)) {
      const filePath = path.join(BRAIN_SRC, relativePath);
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const content = fs.readFileSync(filePath, "utf-8");
      const lineCount = content.split("\n").length;

      if (lineCount > limits.threshold) {
        violations.push(
          `${relativePath}: ${lineCount} lines (threshold: ${limits.threshold}, target: ${limits.target})`,
        );
      }

      // Update the recorded current size for tracking
      fileLimits[relativePath].current = lineCount;
    }

    expect(
      violations,
      `Critical files should be within size thresholds. ` +
        `Violations:\n${violations.join("\n")}\n\n` +
        `Size tracking (current/target/threshold):\n${Object.entries(fileLimits)
          .map(([f, l]) => `  ${f}: ${l.current}/${l.target}/${l.threshold}`)
          .join("\n")}`,
    ).toEqual([]);
  });
});
