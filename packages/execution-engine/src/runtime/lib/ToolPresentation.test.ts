import { describe, expect, it } from "vitest";
import { getToolPresentation } from "./ToolPresentation.js";

describe("ToolPresentation", () => {
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
});
