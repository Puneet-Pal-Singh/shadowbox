import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const REPO_ROOT = join(import.meta.dirname, "../../../../../");
const ADAPTER_PACKAGE_SEGMENT =
  "packages/orchestrator-adapters-cloudflare-agents/";

describe("Cloudflare Agents SDK boundary", () => {
  it("keeps direct SDK imports isolated to the adapter package", () => {
    const rawOutput = execFileSync(
      "rg",
      [
        "-n",
        "^\\s*(import|export)\\s+.*from\\s+[\"']agents[\"']",
        "apps",
        "packages",
        "-g",
        "!**/dist/**",
      ],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
      },
    ).trim();

    const lines = rawOutput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.includes(ADAPTER_PACKAGE_SEGMENT)).toBe(true);
    }
  });

  it("exports the Brain runtime agent without importing the SDK directly", () => {
    const source = readFileSync(
      join(REPO_ROOT, "apps/brain/src/runtime/RunEngineAgent.ts"),
      "utf8",
    );

    expect(source).toContain(
      '@shadowbox/orchestrator-adapters-cloudflare-agents',
    );
    expect(source).not.toContain('from "agents"');
    expect(source).not.toContain("from 'agents'");
  });
});
