import { describe, expect, it } from "vitest";
import { getToolPresentation } from "./ToolPresentation.js";

describe("ToolPresentation", () => {
  it("uses explicit description as display text when explicit display text is missing", () => {
    expect(
      getToolPresentation("read_file", {
        path: "src/components/Footer.tsx",
        description: "Check footer file",
      }),
    ).toEqual({
      description: "Check footer file",
      displayText: "Check footer file",
      summary: "Reading file contents from src/components/Footer.tsx.",
    });
  });

  it("derives search-style copy for search_code", () => {
    expect(
      getToolPresentation("search_code", {
        pattern: "footer",
        path: "src/components",
      }),
    ).toEqual({
      description: "Search for footer",
      displayText: "Searching for footer",
      summary: "Searching src/components for footer.",
    });
  });

  it("throws a clear validation error for invalid tool input", () => {
    expect(() =>
      getToolPresentation("read_file", {
        path: "",
      }),
    ).toThrow("[tool-presentation/read_file] Invalid read_file input");
  });
});
