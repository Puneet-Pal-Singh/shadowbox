import { describe, it, expect } from "vitest";
import { RepoSummaryFormatter } from "./RepoSummaryFormatter.js";
import type { RepoSummary, RepoFileMeta } from "../types.js";
import { FileKind } from "../types.js";

describe("RepoSummaryFormatter", () => {
  const mockSummary: RepoSummary = {
    rootPath: "/test/repo",
    scannedAt: "2026-02-10T20:00:00.000Z",
    totalFiles: 50,
    byKind: {
      [FileKind.SOURCE]: 30,
      [FileKind.TEST]: 10,
      [FileKind.CONFIG]: 5,
      [FileKind.DOC]: 3,
      [FileKind.DB]: 1,
      [FileKind.TOOLING]: 1,
      [FileKind.OTHER]: 0,
    },
    entryPoints: [
      {
        path: "src/index.ts",
        ext: "ts",
        size: 156,
        loc: 156,
        kind: FileKind.SOURCE,
        importance: 0.95,
      },
    ],
    largestFiles: [
      {
        path: "src/utils.ts",
        ext: "ts",
        size: 5000,
        loc: 412,
        kind: FileKind.SOURCE,
        importance: 0.75,
      },
    ],
    importantFiles: [
      {
        path: "src/index.ts",
        ext: "ts",
        size: 156,
        loc: 156,
        kind: FileKind.SOURCE,
        importance: 0.95,
      },
    ],
    allFiles: [],
  };

  describe("formatText", () => {
    it("should produce readable text", () => {
      const text = RepoSummaryFormatter.formatText(mockSummary);

      expect(text).toContain("Repo Awareness Summary");
      expect(text).toContain("Total files: 50");
      expect(text).toContain("File Distribution:");
      expect(text).toContain("Entry Points:");
      expect(text).toContain("Largest Files:");
      expect(text).toContain("Most Important:");
    });

    it("should include entry points", () => {
      const text = RepoSummaryFormatter.formatText(mockSummary);

      expect(text).toContain("src/index.ts");
    });

    it("should be deterministic", () => {
      const text1 = RepoSummaryFormatter.formatText(mockSummary);
      const text2 = RepoSummaryFormatter.formatText(mockSummary);

      expect(text1).toBe(text2);
    });

    it("should not include code keywords", () => {
      const text = RepoSummaryFormatter.formatText(mockSummary);

      expect(text).not.toContain("function");
      expect(text).not.toContain("class");
      expect(text).not.toContain("const ");
    });
  });

  describe("formatJson", () => {
    it("should produce valid JSON", () => {
      const json = RepoSummaryFormatter.formatJson(mockSummary);
      const parsed = JSON.parse(json);

      expect(parsed.rootPath).toBe("/test/repo");
      expect(parsed.totalFiles).toBe(50);
    });

    it("should be deterministic", () => {
      const json1 = RepoSummaryFormatter.formatJson(mockSummary);
      const json2 = RepoSummaryFormatter.formatJson(mockSummary);

      expect(JSON.parse(json1)).toEqual(JSON.parse(json2));
    });
  });

  describe("formatDebug", () => {
    it("should produce verbose output", () => {
      const debug = RepoSummaryFormatter.formatDebug(mockSummary);

      expect(debug).toContain("REPO AWARENESS DEBUG");
      expect(debug).toContain("By Kind:");
      expect(debug).toContain("Entry Points");
      expect(debug).toContain("Most Important");
    });

    it("should include more detail sections", () => {
      const debug = RepoSummaryFormatter.formatDebug(mockSummary);

      // Debug format should have more sections
      expect(debug).toContain("Entry Points");
      expect(debug).toContain("Most Important");
      expect(debug).toContain("Largest Files");
    });
  });

  describe("formatJsonCompact", () => {
    it("should produce single-line JSON", () => {
      const compact = RepoSummaryFormatter.formatJsonCompact(mockSummary);

      expect(compact).not.toContain("\n");
      const parsed = JSON.parse(compact);
      expect(parsed.totalFiles).toBe(50);
    });
  });
});
