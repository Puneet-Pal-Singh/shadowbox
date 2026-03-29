import { describe, expect, it } from "vitest";
import { detectsMutation } from "./detectsMutation.js";

describe("detectsMutation", () => {
  it.each([
    "generate file",
    "create function",
    "implement this feature",
    "write the middleware",
    "insert a new section",
    "append a footer",
    "modify the navbar",
    "improve this",
    "rewrite the component",
    "add a button",
    "remove dead code",
    "delete the old helper",
    "replace the hero copy",
    "rename this hook",
    "fix the layout",
    "refactor the auth flow",
    "build the landing page",
    "construct a pricing section",
    "develop the profile page",
    "make it prettier",
    "make this better",
    "make the page cleaner",
    "make the design more modern",
  ])("returns true for mutating prompt %j", (prompt) => {
    expect(detectsMutation(prompt)).toBe(true);
  });

  it.each([
    "",
    "check my landing component",
    "read the README",
    "show logging output for the last run",
    "what is in middleware.ts",
    "grep for landing page routes",
    "list the files in src/components",
    "can you inspect my git info",
  ])("returns false for read-only prompt %j", (prompt) => {
    expect(detectsMutation(prompt)).toBe(false);
  });
});
