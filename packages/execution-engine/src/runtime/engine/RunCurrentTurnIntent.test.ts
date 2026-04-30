import { describe, expect, it } from "vitest";
import {
  classifyCurrentTurnIntent,
  classifyLocalDiffRelevance,
} from "./RunCurrentTurnIntent.js";

describe("RunCurrentTurnIntent", () => {
  it("keeps bare branch inspection prompts read-only", () => {
    expect(classifyCurrentTurnIntent("what branch is this PR on?")).toBe(
      "read_only",
    );
  });

  it("treats create-branch prompts as mutation", () => {
    expect(classifyCurrentTurnIntent("create branch for this fix")).toBe(
      "mutation",
    );
  });

  it("normalizes windows-style paths when classifying local diff relevance", () => {
    const relevance = classifyLocalDiffRelevance({
      prompt: "stage src/app.ts",
      changedFiles: ["src\\app.ts"],
      requestedFiles: ["src/app.ts"],
    });

    expect(relevance).toBe("relevant");
  });
});
