import { describe, it, expect } from "vitest";
import { FileClassifier } from "./FileClassifier.js";
import { FileKind } from "../types.js";

describe("FileClassifier", () => {
  describe("classify", () => {
    it("should classify source files", () => {
      expect(FileClassifier.classify("src/index.ts")).toBe(FileKind.SOURCE);
      expect(FileClassifier.classify("lib/utils.js")).toBe(FileKind.SOURCE);
      expect(FileClassifier.classify("cmd/main.go")).toBe(FileKind.SOURCE);
    });

    it("should classify test files", () => {
      expect(FileClassifier.classify("src/utils.test.ts")).toBe(FileKind.TEST);
      expect(FileClassifier.classify("tests/integration.spec.ts")).toBe(FileKind.TEST);
      expect(FileClassifier.classify("__tests__/auth.test.ts")).toBe(FileKind.TEST);
    });

    it("should classify doc files", () => {
      expect(FileClassifier.classify("README.md")).toBe(FileKind.DOC);
      expect(FileClassifier.classify("docs/guide.md")).toBe(FileKind.DOC);
      expect(FileClassifier.classify("CHANGELOG.md")).toBe(FileKind.DOC);
    });

    it("should classify config files", () => {
      expect(FileClassifier.classify("package.json")).toBe(FileKind.CONFIG);
      expect(FileClassifier.classify("tsconfig.json")).toBe(FileKind.CONFIG);
      expect(FileClassifier.classify(".eslintrc.json")).toBe(FileKind.CONFIG);
    });

    it("should classify db files", () => {
      expect(FileClassifier.classify("migrations/001_init.sql")).toBe(FileKind.DB);
      expect(FileClassifier.classify("schema/users.sql")).toBe(FileKind.DB);
    });

    it("should classify tooling files", () => {
      expect(FileClassifier.classify("scripts/build.sh")).toBe(FileKind.TOOLING);
      expect(FileClassifier.classify("Makefile")).toBe(FileKind.TOOLING);
    });

    it("should classify other files", () => {
      expect(FileClassifier.classify("data.csv")).toBe(FileKind.OTHER);
      expect(FileClassifier.classify("notes.txt")).toBe(FileKind.OTHER);
    });
  });

  describe("isEntryPoint", () => {
    it("should identify entry points", () => {
      expect(FileClassifier.isEntryPoint("src/index.ts")).toBe(true);
      expect(FileClassifier.isEntryPoint("src/main.ts")).toBe(true);
      expect(FileClassifier.isEntryPoint("index.ts")).toBe(true);
    });

    it("should identify cmd/ pattern as entry point", () => {
      expect(FileClassifier.isEntryPoint("cmd/server/main.go")).toBe(true);
      expect(FileClassifier.isEntryPoint("cmd/cli/main.go")).toBe(true);
    });

    it("should not identify non-entry points", () => {
      expect(FileClassifier.isEntryPoint("src/utils.ts")).toBe(false);
      expect(FileClassifier.isEntryPoint("lib/other/index.ts")).toBe(false);
    });
  });

  describe("getKindWeight", () => {
    it("should assign weights in correct order", () => {
      const sourceWeight = FileClassifier.getKindWeight(FileKind.SOURCE);
      const testWeight = FileClassifier.getKindWeight(FileKind.TEST);
      const configWeight = FileClassifier.getKindWeight(FileKind.CONFIG);

      expect(sourceWeight).toBeGreaterThan(testWeight);
      expect(configWeight).toBeGreaterThan(testWeight);
    });
  });
});
