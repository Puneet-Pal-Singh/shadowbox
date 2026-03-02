import { describe, expect, it } from "vitest";
import {
  hasValidTaskInput,
  isConcreteCommandInput,
  isConcretePathInput,
} from "./TaskInputContract.js";

describe("TaskInputContract", () => {
  it("accepts concrete planner/executor inputs", () => {
    expect(hasValidTaskInput("analyze", { path: "src/main.ts" })).toBe(true);
    expect(hasValidTaskInput("shell", { command: "pnpm test" })).toBe(true);
    expect(hasValidTaskInput("git", { action: "git_status" })).toBe(true);
    expect(hasValidTaskInput("review", undefined)).toBe(true);
  });

  it("rejects vague descriptions as executable input", () => {
    expect(isConcretePathInput("Analyze the current workspace")).toBe(false);
    expect(isConcreteCommandInput("check if node exists")).toBe(false);
    expect(hasValidTaskInput("analyze", { path: "read the file" })).toBe(false);
    expect(hasValidTaskInput("shell", { command: "if tests fail, fix them" })).toBe(false);
  });
});
