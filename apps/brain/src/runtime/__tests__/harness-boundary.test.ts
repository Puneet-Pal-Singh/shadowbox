import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Architecture test: Enforce harness adapter boundary.
 *
 * Prevents harness-specific logic from leaking into core runtime modules.
 * Core runtime must depend ONLY on HarnessAdapterPort, not harness implementations.
 *
 * Blocking list: Files that should NEVER import harness-specific modules.
 * - RunEngine
 * - RunEngineRuntime
 * - Execution orchestration core
 * - Provider/model policy enforcement
 */
describe("HarnessAdapterPort Boundary", () => {
  const coreModules = [
    "./engine/RunEngine.ts",
    "./engine/RunManifestPolicy.ts",
    "./provider/ProviderConfiguration.ts",
  ];

  const forbiddenImports = [
    "cloudflare-sandbox-adapter",
    "local-sandbox-adapter",
    "harness-impl",
    "@cloudflare/sandbox",
  ];

  it("should prevent harness-specific imports in core runtime modules", () => {
    const runtimePath = path.join(__dirname, "..");

    for (const modulePath of coreModules) {
      const fullPath = path.join(runtimePath, modulePath);

      if (!fs.existsSync(fullPath)) {
        throw new Error(`Boundary test module not found: ${fullPath}`);
      }

      const content = fs.readFileSync(fullPath, "utf-8");

      for (const forbiddenImport of forbiddenImports) {
        // Match: from "module", from 'module', require("module"), require('module')
        // with flexible whitespace
        const pattern = new RegExp(
          String.raw`(?:from|require)\s*\(?\s*['"]${forbiddenImport}['"]`,
        );

        expect(content).not.toMatch(
          pattern,
          `Core module ${modulePath} imports forbidden harness module: ${forbiddenImport}`,
        );
      }
    }
  });

  it("should export HarnessAdapterPort from ports index", () => {
    const portsIndexPath = path.join(__dirname, "../ports/index.ts");
    const content = fs.readFileSync(portsIndexPath, "utf-8");

    expect(content).toContain("HarnessAdapter");
    expect(content).toContain("HarnessAdapterRegistry");
    expect(content).toContain("HarnessAdapterPort");
  });

  it("should not allow direct harness implementation instantiation in orchestration", () => {
    const runEngineRuntimePath = path.join(__dirname, "../RunEngineRuntime.ts");

    if (!fs.existsSync(runEngineRuntimePath)) {
      console.warn("RunEngineRuntime not found for boundary test");
      return;
    }

    const content = fs.readFileSync(runEngineRuntimePath, "utf-8");

    // Prevent patterns like: new CloudflareHarness(), new LocalHarness()
    expect(content).not.toMatch(/new\s+(Cloudflare|Local)\w*Harness\(/);
    // Prevent patterns like: CloudflareHarnessAdapter.create()
    expect(content).not.toMatch(/\w*HarnessAdapter\.create\(/);
  });
});
