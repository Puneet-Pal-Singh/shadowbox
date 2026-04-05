import { describe, expect, it } from "vitest";
import { normalizeWorkspacePath } from "./AgenticLoopToolExecutor.js";

describe("AgenticLoopToolExecutor", () => {
  it("preserves leading @ for workspace-scoped paths", () => {
    expect(normalizeWorkspacePath(" '@types/foo.ts', ")).toBe("@types/foo.ts");
    expect(normalizeWorkspacePath('"@scope/pkg";')).toBe("@scope/pkg");
  });
});
