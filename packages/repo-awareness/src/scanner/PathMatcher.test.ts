import { describe, it, expect } from "vitest";
import { PathMatcher } from "./PathMatcher.js";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

describe("PathMatcher", () => {
  const tempDir = join("/tmp", `test-matcher-${randomBytes(4).toString("hex")}`);

  it("should ignore node_modules by default", () => {
    const matcher = new PathMatcher(tempDir);
    expect(matcher.shouldIgnore("node_modules/lodash/index.js")).toBe(true);
  });

  it("should ignore .git by default", () => {
    const matcher = new PathMatcher(tempDir);
    expect(matcher.shouldIgnore(".git/config")).toBe(true);
  });

  it("should ignore dist by default", () => {
    const matcher = new PathMatcher(tempDir);
    expect(matcher.shouldIgnore("dist/bundle.js")).toBe(true);
  });

  it("should not ignore source files", () => {
    const matcher = new PathMatcher(tempDir);
    expect(matcher.shouldIgnore("src/index.ts")).toBe(false);
    expect(matcher.shouldIgnore("README.md")).toBe(false);
  });

  it("should accept custom patterns", () => {
    const matcher = new PathMatcher(tempDir, ["*.log"]);
    expect(matcher.shouldIgnore("debug.log")).toBe(true);
  });

  it("should handle .DS_Store", () => {
    const matcher = new PathMatcher(tempDir);
    expect(matcher.shouldIgnore(".DS_Store")).toBe(true);
  });

  it("should handle glob patterns", () => {
    const matcher = new PathMatcher(tempDir, ["temp/**"]);
    expect(matcher.shouldIgnore("temp/file.txt")).toBe(true);
    expect(matcher.shouldIgnore("src/temp/file.txt")).toBe(false);
  });
});
