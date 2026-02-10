import { describe, it, expect } from "vitest";
import { RepoIndexBuilder } from "./RepoIndexBuilder.js";
import type { RepoFileMeta } from "../types.js";
import { FileKind } from "../types.js";

describe("RepoIndexBuilder", () => {
  const mockFiles: RepoFileMeta[] = [
    {
      path: "src/index.ts",
      ext: "ts",
      size: 156,
      loc: 156,
      kind: FileKind.SOURCE,
      importance: 0.95,
    },
    {
      path: "src/utils.ts",
      ext: "ts",
      size: 412,
      loc: 412,
      kind: FileKind.SOURCE,
      importance: 0.75,
    },
    {
      path: "src/utils.test.ts",
      ext: "ts",
      size: 200,
      kind: FileKind.TEST,
      importance: 0.2,
    },
    {
      path: "package.json",
      ext: "json",
      size: 500,
      kind: FileKind.CONFIG,
      importance: 0.9,
    },
    {
      path: "README.md",
      ext: "md",
      size: 1200,
      kind: FileKind.DOC,
      importance: 0.7,
    },
    {
      path: "node_modules/lodash/index.js",
      ext: "js",
      size: 5000,
      kind: FileKind.SOURCE,
      importance: 0.1,
    },
  ];

  describe("build", () => {
    it("should count files by kind", () => {
      const builder = new RepoIndexBuilder(mockFiles);
      const summary = builder.build();

      expect(summary.byKind[FileKind.SOURCE]).toBe(3);
      expect(summary.byKind[FileKind.TEST]).toBe(1);
      expect(summary.byKind[FileKind.CONFIG]).toBe(1);
      expect(summary.byKind[FileKind.DOC]).toBe(1);
    });

    it("should return total file count", () => {
      const builder = new RepoIndexBuilder(mockFiles);
      const summary = builder.build();

      expect(summary.totalFiles).toBe(6);
    });

    it("should identify entry points", () => {
      const builder = new RepoIndexBuilder(mockFiles);
      const summary = builder.build();

      // Should find src/index.ts as entry point
      expect(summary.entryPoints.length).toBeGreaterThan(0);
      expect(summary.entryPoints.some((f) => f.path === "src/index.ts")).toBe(true);
    });

    it("should identify largest files", () => {
      const builder = new RepoIndexBuilder(mockFiles);
      const summary = builder.build();

      expect(summary.largestFiles[0].path).toBe("node_modules/lodash/index.js");
      expect(summary.largestFiles[1].path).toBe("README.md");
    });

    it("should identify important files", () => {
      const builder = new RepoIndexBuilder(mockFiles);
      const summary = builder.build();

      expect(summary.importantFiles[0].path).toBe("src/index.ts");
      expect(summary.importantFiles[0].importance).toBe(0.95);
    });

    it("should be deterministic", () => {
      const builder1 = new RepoIndexBuilder([...mockFiles]);
      const builder2 = new RepoIndexBuilder([...mockFiles]);

      const summary1 = builder1.build();
      const summary2 = builder2.build();

      // Compare structure
      expect(summary1.totalFiles).toBe(summary2.totalFiles);
      expect(summary1.byKind).toEqual(summary2.byKind);
      expect(summary1.entryPoints).toEqual(summary2.entryPoints);
    });

    it("should sort files by path for determinism", () => {
      // Reverse the order
      const shuffledFiles = [...mockFiles].reverse();
      const builder = new RepoIndexBuilder(shuffledFiles);
      const summary = builder.build();

      // Check that first and last files are in expected order (alphabetical)
      const firstPath = summary.allFiles[0]?.path || "";
      const lastPath = summary.allFiles[summary.allFiles.length - 1]?.path || "";
      
      expect(firstPath.localeCompare(lastPath)).toBeLessThanOrEqual(0);
    });

    it("should handle empty file list", () => {
      const builder = new RepoIndexBuilder([]);
      const summary = builder.build();

      expect(summary.totalFiles).toBe(0);
      expect(summary.entryPoints).toHaveLength(0);
      expect(summary.importantFiles).toHaveLength(0);
    });
  });
});
