/**
 * Architecture Boundary Test: BYOK v2 Removal
 *
 * Enforces that deprecated BYOK v2 fallback codepaths stay removed.
 */

import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const SRC_ROOT = path.join(__dirname, "..");

function collectSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".")) {
        files.push(...collectSourceFiles(entryPath));
      }
      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts")
    ) {
      files.push(entryPath);
    }
  }

  return files;
}

describe("Architecture Boundary: BYOK v2 removal", () => {
  it("should not contain the deprecated dual-read adapter source", () => {
    const dualReadPath = path.join(
      SRC_ROOT,
      "services",
      "byok",
      "ByokDualReadAdapter.ts",
    );
    expect(
      fs.existsSync(dualReadPath),
      "ByokDualReadAdapter.ts must stay removed after v2 fallback retirement",
    ).toBe(false);
  });

  it("should not reference removed BYOK legacy migration env flags in runtime source", () => {
    const forbiddenTokens = [
      "BYOK_LEGACY_READ_FALLBACK_ENABLED",
      "BYOK_LEGACY_BACKFILL_ENABLED",
      "BYOK_LEGACY_ROLLBACK_ENABLED",
      "BYOK_LEGACY_CUTOFF_AT",
      "LegacyCredentialMigrationConfig",
    ];
    const violations: string[] = [];

    for (const file of collectSourceFiles(SRC_ROOT)) {
      const content = fs.readFileSync(file, "utf-8");
      for (const token of forbiddenTokens) {
        if (content.includes(token)) {
          violations.push(`${file} contains "${token}"`);
        }
      }
    }

    expect(
      violations,
      `Found removed BYOK legacy identifiers in runtime source:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
