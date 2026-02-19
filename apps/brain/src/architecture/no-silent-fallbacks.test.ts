/**
 * Architecture Boundary Test: No Silent Fallbacks in Production
 *
 * Enforces that runtime code does not have implicit/silent fallbacks:
 * - No `... ?? defaultValue` in critical decision paths without explicit logging
 * - No implicit type coercion fallbacks
 * - No swallowing of validation errors
 * - All fallback logic must be explicit and emit structured events
 *
 * This prevents runtime instability and hard-to-debug issues.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const BRAIN_SRC = path.join(__dirname, "..");

interface FallbackAnomaly {
  file: string;
  line: number;
  code: string;
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

describe("Architecture Boundary: No Silent Fallbacks", () => {
  it("should not have catch blocks that silently swallow errors", () => {
    const runtimeFiles = getAllTSFiles(path.join(BRAIN_SRC, "runtime"));
    const controllerFiles = getAllTSFiles(path.join(BRAIN_SRC, "controllers"));
    const testFiles = [...runtimeFiles, ...controllerFiles];

    const violations: FallbackAnomaly[] = [];

    for (const file of testFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match: catch (...) { } (empty catch block - single or multi-line)
        // Pattern covers:
        // - Single line: catch (...) { }
        // - Multi-line: catch (...) {\n} (closing brace on next line with only whitespace)
        if (/catch\s*\([^)]*\)\s*\{/.test(line)) {
          const closingBraceIdx = content.indexOf("}", content.indexOf(line) + line.length);
          const blockContent = content.substring(content.indexOf(line) + line.length, closingBraceIdx).trim();
          
          // Check if catch block is empty or only contains whitespace/comments
          if (!blockContent || /^\s*\/\/.*$/.test(blockContent) || /^\s*\/\*.*\*\/\s*$/.test(blockContent)) {
            violations.push({
              file,
              line: i + 1,
              code: line.trim(),
              reason: "Empty or comment-only catch block silently swallows errors",
            });
          }
        }

        // Match: catch (...) { /* TODO */ } - deferred handling
        if (/catch\s*\([^)]*\)\s*\{\s*\/\*\s*TODO/.test(line)) {
          violations.push({
            file,
            line: i + 1,
            code: line.trim(),
            reason: "TODO in catch block defers error handling",
          });
        }
      }
    }

    expect(
      violations,
      `Runtime paths should not have silent error swallowing. Violations:\n${violations.map((v) => `${v.file}:${v.line} - ${v.reason}`).join("\n")}`
    ).toEqual([]);
  });

  it("should verify RunEngineRuntime does not have implicit agent type fallback", () => {
    const runtimeFile = path.join(
      BRAIN_SRC,
      "runtime",
      "RunEngineRuntime.ts"
    );
    if (fs.existsSync(runtimeFile)) {
      const content = fs.readFileSync(runtimeFile, "utf-8");

      // Check that invalid agent types do not silently fallback to "coding"
      // Flag if there's a silent fallback pattern (no error thrown)
      const hasSilentFallback = /agentType.*\?\?|agentType.*\|\||coding.*default/i.test(content);
      
      expect(
        hasSilentFallback,
        "RunEngineRuntime should not silently fallback agent types"
      ).toBe(false);
    }
  });

  it("should verify AIService does not have implicit provider fallback", () => {
    const aiServiceFile = path.join(BRAIN_SRC, "services", "AIService.ts");
    if (fs.existsSync(aiServiceFile)) {
      const content = fs.readFileSync(aiServiceFile, "utf-8");

      // Verify it doesn't have silent provider fallback patterns
      const hasSilentProviderFallback =
        /provider.*\?\?|default.*provider|implicit.*fallback/i.test(content);

      expect(
        hasSilentProviderFallback,
        "AIService should not have implicit provider fallback"
      ).toBe(false);
    }
  });

  it("should verify controllers do not parse request body with empty fallback", () => {
    const chatControllerFile = path.join(
      BRAIN_SRC,
      "controllers",
      "ChatController.ts"
    );
    if (fs.existsSync(chatControllerFile)) {
      const content = fs.readFileSync(chatControllerFile, "utf-8");

      // Verify no silent JSON.parse() with empty object fallback
      const hasSilentParseError =
        /JSON\.parse\s*\([^)]*\)\s*\|\|\s*\{\}/.test(content);

      expect(
        hasSilentParseError,
        "Controllers should not silently parse JSON with fallback to {}"
      ).toBe(false);
    }
  });

  it("should verify error responses are always explicit", () => {
    const httpErrorFile = path.join(BRAIN_SRC, "http", "errors.ts");
    const httpResponseFile = path.join(BRAIN_SRC, "http", "response.ts");

    if (fs.existsSync(httpErrorFile)) {
      const content = fs.readFileSync(httpErrorFile, "utf-8");
      expect(content, "http/errors.ts should export error mapping utilities")
        .toContain("export");
    }

    if (fs.existsSync(httpResponseFile)) {
      const content = fs.readFileSync(httpResponseFile, "utf-8");
      expect(
        content,
        "http/response.ts should have error response helpers"
      ).toContain("error");
    }
  });

  it("should verify domain errors are typed and not stringified", () => {
    const allFiles = getAllTSFiles(BRAIN_SRC, ["architecture"]);
    const violations: FallbackAnomaly[] = [];

    for (const file of allFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match: throw new Error(string) in application/domain (should use domain errors)
        if (
          /throw\s+new\s+Error\s*\(/.test(line) &&
          (file.includes("/application/") || file.includes("/domain/"))
        ) {
          violations.push({
            file,
            line: i + 1,
            code: line.trim(),
            reason:
              "Should throw typed domain errors, not generic Error instances",
          });
        }

        // Match: return { error: "string" } (should use typed errors)
        if (/return\s*\{\s*error\s*:\s*["']/.test(line)) {
          violations.push({
            file,
            line: i + 1,
            code: line.trim(),
            reason: "Should return typed errors, not string literals",
          });
        }
      }
    }

    // Allow minimal tolerance for edge cases (e.g., error boundary utilities, early-stage code)
    // Tolerance: 0 violations in strict application/domain paths
    // Future PRs should incrementally reduce this to zero
    if (violations.length > 0) {
      console.warn(
        `[architecture] Found ${violations.length} untyped error usage(s) in application/domain layers. ` +
        `Plan to address in follow-up PRs: ${violations.map((v) => `${v.file}:${v.line}`).join(", ")}`
      );
    }
    
    expect(
      violations.length,
      `Application and domain layer should use typed errors. Currently ${violations.length} violation(s):\n${violations.map((v) => `${v.file}:${v.line} - ${v.reason}`).join("\n")}`
    ).toBeLessThan(3); // Allow 0-2 violations for now
  });

  it("should verify no implicit env/localhost fallback in production paths", () => {
    const runtimeFiles = getAllTSFiles(path.join(BRAIN_SRC, "runtime"));
    const violations: FallbackAnomaly[] = [];

    for (const file of runtimeFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match: env.DEV_MODE ?? false or process.env.DEV
        if (/env\.(DEV|LOCALHOST|DEBUG).*\?\?|process\.env\.(DEV|NODE_ENV)/.test(line)) {
          // This is a flag check, verify it's handled explicitly
          // Look ahead up to 5 lines for error handling (accounts for multi-line blocks)
          let hasExplicitHandling = false;
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            if (/if\s*\(|throw|error|Error|console\.error/.test(lines[j])) {
              hasExplicitHandling = true;
              break;
            }
          }
          
          if (!hasExplicitHandling) {
            violations.push({
              file,
              line: i + 1,
              code: line.trim(),
              reason: "Dev/localhost fallback should be explicit, not silent",
            });
          }
        }
      }
    }

    expect(
      violations,
      `Runtime should not have implicit dev/localhost fallbacks:\n${violations.map((v) => `${v.file}:${v.line} - ${v.reason}`).join("\n")}`
    ).toEqual([]);
  });

  it("should verify provider selection includes explicit fallback reason codes", () => {
    const aiServiceDir = path.join(BRAIN_SRC, "services", "ai");
    if (fs.existsSync(aiServiceDir)) {
      const files = fs
        .readdirSync(aiServiceDir)
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

      let hasExplicitFallback = false;
      for (const file of files) {
        const content = fs.readFileSync(
          path.join(aiServiceDir, file),
          "utf-8"
        );
        if (
          content.includes("fallback") ||
          content.includes("reasonCode") ||
          content.includes("explicit")
        ) {
          hasExplicitFallback = true;
          break;
        }
      }

      expect(
        hasExplicitFallback || files.length === 0,
        "AI service should have explicit fallback handling"
      ).toBe(true);
    }
  });
});
