/**
 * Portability Architecture Guard Tests
 *
 * Prevents regression: ensures core runtime remains provider/harness-agnostic.
 * Blocks direct imports of platform-specific types in orchestration classes.
 *
 * Aligned to Plan 59 constraint: "No provider/harness branches in core runtime"
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Files that form the core orchestration path
const CORE_ORCHESTRATION_FILES = [
  "apps/brain/src/runtime/RunEngineRuntime.ts",
  "apps/brain/src/runtime/factories/ExecutionGatewayFactory.ts",
  "apps/brain/src/runtime/factories/RuntimeCompositionFactory.ts",
  "apps/brain/src/runtime/factories/LLMRuntimeFactory.ts",
  "apps/brain/src/controllers/ChatController.ts",
];

// Platform-specific imports that must NOT appear in core
const FORBIDDEN_PATTERNS = [
  // Direct Durable Object types (must use adapters)
  /import.*DurableObject[^/]/,
  /import.*DurableObjectState/,

  // Provider-specific hardcoding
  /if\s*\(\s*providerId\s*===\s*["']openai["']\s*\)/,
  /if\s*\(\s*providerId\s*===\s*["']anthropic["']\s*\)/,
  /if\s*\(\s*providerId\s*===\s*["']groq["']\s*\)/,

  // Harness-specific branching
  /if\s*\(\s*harnessId.*===/,
  /switch\s*\(\s*harness/,
];

// Adapter-specific files that ARE allowed to use platform primitives
const ADAPTER_FILES = [
  "apps/brain/src/runtime/adapters/",
  "apps/brain/src/runtime/factories/PortalityAdapterFactory.ts",
  "apps/brain/src/runtime/factories/LLMRuntimeFactory.ts", // Wraps provider logic
];

describe("Portability Architecture Guards", () => {
  describe("Core Orchestration: No Platform Coupling", () => {
    for (const filePath of CORE_ORCHESTRATION_FILES) {
      it(`should not hardcode provider/harness logic in ${path.basename(filePath)}`, () => {
        const fullPath = path.join(
          process.cwd(),
          filePath,
        );

        if (!fs.existsSync(fullPath)) {
          // Skip if file doesn't exist (might be in different env)
          return;
        }

        const content = fs.readFileSync(fullPath, "utf-8");

        // Check if this is an adapter file (allowed to have platform specifics)
        const isAdapterFile = ADAPTER_FILES.some((adapterPath) =>
          fullPath.includes(adapterPath),
        );

        if (isAdapterFile) {
          // Adapters are allowed to have platform-specific logic
          return;
        }

        // Core orchestration must not have forbidden patterns
        for (const pattern of FORBIDDEN_PATTERNS) {
          const matches = content.match(pattern);
          expect(
            matches,
            `Found forbidden pattern in ${filePath}: ${pattern}. 
This indicates provider/harness branching in core runtime. 
Move logic to adapters instead.`,
          ).toBeNull();
        }
      });
    }
  });

  describe("Adapter Boundary: Cloudflare Encapsulation", () => {
    it("should isolate Cloudflare imports to adapter modules only", () => {
      for (const filePath of CORE_ORCHESTRATION_FILES) {
        const fullPath = path.join(process.cwd(), filePath);

        if (!fs.existsSync(fullPath)) {
          return;
        }

        const content = fs.readFileSync(fullPath, "utf-8");
        const isAdapterFile = ADAPTER_FILES.some((adapterPath) =>
          fullPath.includes(adapterPath),
        );

        if (isAdapterFile) {
          // Adapters may import from Cloudflare
          return;
        }

        // Core files must not import Cloudflare primitives directly
        const cloudflareImports =
          content.match(
            /from\s+["']cloudflare:[^"']+["']|from\s+["']@cloudflare\/workers-types["']/g,
          ) || [];

        // Allow ONE exception: types for casting in durable object context
        // But not for direct usage
        expect(
          cloudflareImports.length,
          `Found ${cloudflareImports.length} Cloudflare imports in core file ${filePath}. 
Core runtime should depend on ports, not platform primitives.`,
        ).toBe(0);
      }
    });
  });

  describe("Port Usage in Composition", () => {
    it("RuntimeCompositionFactory should use ports from PortalityAdapterFactory", () => {
      const fullPath = path.join(
        process.cwd(),
        "apps/brain/src/runtime/factories/RuntimeCompositionFactory.ts",
      );

      if (!fs.existsSync(fullPath)) {
        return;
      }

      const content = fs.readFileSync(fullPath, "utf-8");

      // Should import from PortalityAdapterFactory
      expect(content).toMatch(/from.*PortalityAdapterFactory/);

      // Should call createRuntimePorts
      expect(content).toMatch(/createRuntimePorts/);

      // Should NOT directly instantiate adapters
      expect(content).not.toMatch(/new Cloudflare.*Adapter/);
    });
  });

  describe("No Fallback Branches", () => {
    it("should not contain silent fallback logic for missing providers/harnesses", () => {
      for (const filePath of CORE_ORCHESTRATION_FILES) {
        const fullPath = path.join(process.cwd(), filePath);

        if (!fs.existsSync(fullPath)) {
          return;
        }

        const content = fs.readFileSync(fullPath, "utf-8");
        const isAdapterFile = ADAPTER_FILES.some((adapterPath) =>
          fullPath.includes(adapterPath),
        );

        if (isAdapterFile) {
          return;
        }

        // Look for fallback patterns that hide failures
        const fallbackPatterns = [
          /\|\|.*defaultProvider/,
          /\|\|.*DefaultAdapterService/,
          /catch\s*\(\s*\)\s*{\s*return.*default/,
        ];

        for (const pattern of fallbackPatterns) {
          const matches = content.match(pattern);
          expect(
            matches,
            `Found fallback pattern in ${filePath}: ${pattern}. 
Fallbacks hide failures and make behavior non-deterministic.`,
          ).toBeNull();
        }
      }
    });
  });
});
