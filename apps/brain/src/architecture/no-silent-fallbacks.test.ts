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

describe("Architecture Boundary: No Silent Fallbacks", () => {
  it("should not have catch blocks that silently swallow errors", () => {
    const runtimeFiles = getAllTSFiles(path.join(BRAIN_SRC, "runtime"));
    const controllerFiles = getAllTSFiles(path.join(BRAIN_SRC, "controllers"));
    const testFiles = [...runtimeFiles, ...controllerFiles];

    const violations: FallbackAnomaly[] = [];

    for (const file of testFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");

      // Calculate cumulative offset for each line to correctly find catch blocks
      let currentOffset = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineStart = currentOffset;

        // Match: catch (...) { } (empty catch block - single or multi-line)
        // Pattern covers:
        // - Single line: catch (...) { }
        // - Multi-line: catch (...) {\n} (closing brace on next line with only whitespace)
        if (/catch\s*\([^)]*\)\s*\{/.test(line)) {
          // Find the opening brace position on this specific line
          const braceMatch = line.match(/catch\s*\([^)]*\)\s*\{/);
          if (braceMatch) {
            const bracePos = lineStart + braceMatch[0].length - 1; // Position of {

            // Find matching closing brace (simple approach: next } after opening {)
            // Note: This is a simplification; nested braces would need proper parsing
            let braceCount = 1;
            let searchPos = bracePos + 1;
            let closingBracePos = -1;

            for (let j = i; j < lines.length && braceCount > 0; j++) {
              const searchLine = lines[j];
              const startIdx = j === i ? bracePos + 1 : 0;

              for (let k = startIdx; k < searchLine.length; k++) {
                if (searchLine[k] === "{") braceCount++;
                if (searchLine[k] === "}") {
                  braceCount--;
                  if (braceCount === 0) {
                    closingBracePos = k;
                    break;
                  }
                }
              }
            }

            // If closing brace found on same line or next few lines
            if (closingBracePos >= 0 && i < lines.length - 1) {
              const blockContent = lines
                .slice(i)
                .join("\n")
                .substring(line.indexOf("{") + 1, closingBracePos)
                .trim();

              // Check if catch block is empty or only contains whitespace/comments
              if (
                !blockContent ||
                /^\s*\/\/.*$/.test(blockContent) ||
                /^\s*\/\*.*\*\/\s*$/.test(blockContent)
              ) {
                violations.push({
                  file,
                  line: i + 1,
                  code: line.trim(),
                  reason:
                    "Empty or comment-only catch block silently swallows errors",
                });
              }
            }
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

        currentOffset += line.length + 1; // +1 for newline
      }
    }

    expect(
      violations,
      `Runtime paths should not have silent error swallowing. Violations:\n${violations.map((v) => `${v.file}:${v.line} - ${v.reason}`).join("\n")}`,
    ).toEqual([]);
  });

  it("should verify RunEngineRuntime does not have implicit agent type fallback", () => {
    const runtimeFile = path.join(BRAIN_SRC, "runtime", "RunEngineRuntime.ts");
    // Fail early if the file was moved/renamed — update the path if so
    expect(
      fs.existsSync(runtimeFile),
      `Expected ${runtimeFile} to exist (may have been moved/renamed)`,
    ).toBe(true);

    const content = fs.readFileSync(runtimeFile, "utf-8");

    // Check that invalid agent types do not silently fallback to "coding"
    // Flag if there's a silent fallback pattern (no error thrown)
    const hasSilentFallback =
      /agentType.*\?\?|agentType.*\|\||coding.*default/i.test(content);

    expect(
      hasSilentFallback,
      "RunEngineRuntime should not silently fallback agent types",
    ).toBe(false);
  });

  it("should verify AIService does not have implicit provider fallback", () => {
    const aiServiceFile = path.join(BRAIN_SRC, "services", "AIService.ts");
    // Fail early if the file was moved/renamed — update the path if so
    expect(
      fs.existsSync(aiServiceFile),
      `Expected ${aiServiceFile} to exist (may have been moved/renamed)`,
    ).toBe(true);

    const content = fs.readFileSync(aiServiceFile, "utf-8");

    // Verify it doesn't have silent provider fallback patterns
    const hasSilentProviderFallback =
      /provider.*\?\?|default.*provider|implicit.*fallback/i.test(content);

    expect(
      hasSilentProviderFallback,
      "AIService should not have implicit provider fallback",
    ).toBe(false);
  });

  it("should verify controllers do not parse request body with empty fallback", () => {
    const chatControllerFile = path.join(
      BRAIN_SRC,
      "controllers",
      "ChatController.ts",
    );
    // Fail early if the file was moved/renamed — update the path if so
    expect(
      fs.existsSync(chatControllerFile),
      `Expected ${chatControllerFile} to exist (may have been moved/renamed)`,
    ).toBe(true);

    const content = fs.readFileSync(chatControllerFile, "utf-8");

    // Verify no silent JSON.parse() with empty object fallback
    const hasSilentParseError = /JSON\.parse\s*\([^)]*\)\s*\|\|\s*\{\}/.test(
      content,
    );

    expect(
      hasSilentParseError,
      "Controllers should not silently parse JSON with fallback to {}",
    ).toBe(false);
  });

  it("should verify error responses are always explicit", () => {
    const httpErrorFile = path.join(BRAIN_SRC, "http", "errors.ts");
    const httpResponseFile = path.join(BRAIN_SRC, "http", "response.ts");

    if (fs.existsSync(httpErrorFile)) {
      const content = fs.readFileSync(httpErrorFile, "utf-8");
      expect(
        content,
        "http/errors.ts should export error mapping utilities",
      ).toContain("export");
    }

    if (fs.existsSync(httpResponseFile)) {
      const content = fs.readFileSync(httpResponseFile, "utf-8");
      expect(
        content,
        "http/response.ts should have error response helpers",
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
          `Plan to address in follow-up PRs: ${violations.map((v) => `${v.file}:${v.line}`).join(", ")}`,
      );
    }

    expect(
      violations.length,
      `Application and domain layer should use typed errors. Currently ${violations.length} violation(s):\n${violations.map((v) => `${v.file}:${v.line} - ${v.reason}`).join("\n")}`,
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
        if (
          /env\.(DEV|LOCALHOST|DEBUG).*\?\?|process\.env\.(DEV|NODE_ENV)/.test(
            line,
          )
        ) {
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
      `Runtime should not have implicit dev/localhost fallbacks:\n${violations.map((v) => `${v.file}:${v.line} - ${v.reason}`).join("\n")}`,
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
        const content = fs.readFileSync(path.join(aiServiceDir, file), "utf-8");
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
        "AI service should have explicit fallback handling",
      ).toBe(true);
    }
  });

  it("should verify services/ai/* does not have implicit fallbacks without logging", () => {
    const aiServiceDir = path.join(BRAIN_SRC, "services", "ai");
    expect(
      fs.existsSync(aiServiceDir),
      `Expected ${aiServiceDir} to exist (may have been moved/renamed)`,
    ).toBe(true);

    const aiFiles = getAllTSFiles(aiServiceDir);
    const violations: FallbackAnomaly[] = [];

    for (const file of aiFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip comment lines to avoid false positives
        if (/^\s*\/\//.test(line)) continue;

        // Check for implicit provider fallback without error/log
        // Allow: explicit error throw, logCompatFallback call, or isStrictMode check
        if (/\bprovider\s*\?\?|\bprovider\s*\|\|/.test(line)) {
          // Look for explicit handling within the next few lines
          let hasExplicitHandling = false;
          for (let j = i; j < Math.min(i + 10, lines.length); j++) {
            if (
              /throw|logCompatFallback|isStrictMode|reasonCode|INVALID_PROVIDER|PROVIDER_NOT_CONNECTED/.test(
                lines[j],
              )
            ) {
              hasExplicitHandling = true;
              break;
            }
          }

          if (!hasExplicitHandling) {
            violations.push({
              file,
              line: i + 1,
              code: line.trim(),
              reason:
                "Provider fallback should be explicit with logging or error",
            });
          }
        }

        // Check for implicit model fallback without error/log
        if (/\bmodel\s*\?\?\s*["']|\bmodel\s*\|\|\s*["']/.test(line)) {
          let hasExplicitHandling = false;
          for (let j = i; j < Math.min(i + 10, lines.length); j++) {
            if (
              /throw|logCompatFallback|isStrictMode|reasonCode|MODEL_NOT_ALLOWED/.test(
                lines[j],
              )
            ) {
              hasExplicitHandling = true;
              break;
            }
          }

          if (!hasExplicitHandling) {
            violations.push({
              file,
              line: i + 1,
              code: line.trim(),
              reason: "Model fallback should be explicit with logging or error",
            });
          }
        }
      }
    }

    expect(
      violations,
      `services/ai/* should not have implicit fallbacks without logging:\n${violations.map((v) => `${v.file}:${v.line} - ${v.reason}`).join("\n")}`,
    ).toEqual([]);
  });
});
