import { describe, expect, it } from "vitest";
import { evaluateWorkspaceBootstrap } from "./RunPermissionWorkspacePolicy.js";
import type { WorkspaceBootstrapper } from "../types.js";

describe("RunPermissionWorkspacePolicy", () => {
  it("returns actionable guidance when branch switch is blocked by local checkout conflicts", async () => {
    const workspaceBootstrapper: WorkspaceBootstrapper = {
      bootstrap: async () => ({
        status: "sync-failed",
        message:
          "error: Your local changes to the following files would be overwritten by checkout:\n\tsrc/components/layout/Footer.tsx\nPlease commit your changes or stash them before you switch branches.\nAborting",
      }),
    };

    const evaluation = await evaluateWorkspaceBootstrap(
      "run-1",
      "continue",
      {
        owner: "sourcegraph",
        repo: "shadowbox",
        branch: "style/redesign-footer",
      },
      workspaceBootstrapper,
    );

    expect(evaluation.blocked).toBe(true);
    expect(evaluation.status).toBe("sync-failed");
    expect(evaluation.message).toContain(
      "switching to `style/redesign-footer` would overwrite local changes",
    );
    expect(evaluation.message).toContain(
      "Conflicting file(s): src/components/layout/Footer.tsx.",
    );
    expect(evaluation.message).toContain("No local edits were discarded.");
    expect(evaluation.message).toContain(
      "Commit or stash those edits first, then retry the action.",
    );
  });
});
