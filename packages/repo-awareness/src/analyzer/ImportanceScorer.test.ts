import { describe, it, expect } from "vitest";
import { ImportanceScorer } from "./ImportanceScorer.js";
import type { RepoFileMeta } from "../types.js";
import { FileKind } from "../types.js";

describe("ImportanceScorer", () => {
  describe("score", () => {
    it("should score entry points high", () => {
      const file: RepoFileMeta = {
        path: "src/index.ts",
        ext: "ts",
        size: 200,
        kind: FileKind.SOURCE,
        importance: 0,
        lastModified: new Date().toISOString(),
      };

      const score = ImportanceScorer.score(file);
      expect(score).toBeGreaterThan(0.5);
    });

    it("should score test files low", () => {
      const file: RepoFileMeta = {
        path: "tests/utils.test.ts",
        ext: "ts",
        size: 300,
        kind: FileKind.TEST,
        importance: 0,
        lastModified: new Date().toISOString(),
      };

      const score = ImportanceScorer.score(file);
      expect(score).toBeLessThan(0.5);
    });

    it("should score config files high", () => {
      const file: RepoFileMeta = {
        path: "package.json",
        ext: "json",
        size: 500,
        kind: FileKind.CONFIG,
        importance: 0,
        lastModified: new Date().toISOString(),
      };

      const score = ImportanceScorer.score(file);
      expect(score).toBeGreaterThan(0.6);
    });

    it("should score root-level files higher", () => {
      const rootFile: RepoFileMeta = {
        path: "tsconfig.json",
        ext: "json",
        size: 500,
        kind: FileKind.CONFIG,
        importance: 0,
      };

      const nestedFile: RepoFileMeta = {
        path: "src/deep/nested/config.json",
        ext: "json",
        size: 500,
        kind: FileKind.CONFIG,
        importance: 0,
      };

      const rootScore = ImportanceScorer.score(rootFile);
      const nestedScore = ImportanceScorer.score(nestedFile);

      expect(rootScore).toBeGreaterThan(nestedScore);
    });

    it("should score node_modules and vendor low", () => {
      const file: RepoFileMeta = {
        path: "node_modules/lodash/index.js",
        ext: "js",
        size: 10000,
        kind: FileKind.SOURCE,
        importance: 0,
      };

      const score = ImportanceScorer.score(file);
      expect(score).toBeLessThan(0.5);
    });

    it("should score generated files low", () => {
      const file: RepoFileMeta = {
        path: "dist/bundle.js",
        ext: "js",
        size: 50000,
        kind: FileKind.SOURCE,
        importance: 0,
      };

      const score = ImportanceScorer.score(file);
      expect(score).toBeLessThan(0.5);
    });

    it("should return score between 0 and 1", () => {
      const file: RepoFileMeta = {
        path: "src/random.ts",
        ext: "ts",
        size: 1000,
        kind: FileKind.SOURCE,
        importance: 0,
      };

      const score = ImportanceScorer.score(file);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });
});
