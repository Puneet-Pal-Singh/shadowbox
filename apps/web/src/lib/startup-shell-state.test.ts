import { describe, expect, it } from "vitest";
import { resolveShellStartupState } from "./startup-shell-state";

describe("resolveShellStartupState", () => {
  it("returns locked state while unauthenticated", () => {
    expect(
      resolveShellStartupState({
        isAuthenticated: false,
        hasSetupRun: false,
        hasProviderConnection: false,
        hasRepoContext: false,
        hasRealSession: false,
      }),
    ).toBe("shell_locked_unauthenticated");
  });

  it("returns setup state when authenticated but provider or repo setup is still incomplete", () => {
    expect(
      resolveShellStartupState({
        isAuthenticated: true,
        hasSetupRun: true,
        hasProviderConnection: false,
        hasRepoContext: false,
        hasRealSession: false,
      }),
    ).toBe("shell_authenticated_setup");
  });

  it("returns repo-missing state when provider is connected first", () => {
    expect(
      resolveShellStartupState({
        isAuthenticated: true,
        hasSetupRun: true,
        hasProviderConnection: true,
        hasRepoContext: false,
        hasRealSession: false,
      }),
    ).toBe("shell_authenticated_repo_missing");
  });

  it("returns ready state only when real repo context and provider setup both exist", () => {
    expect(
      resolveShellStartupState({
        isAuthenticated: true,
        hasSetupRun: false,
        hasProviderConnection: true,
        hasRepoContext: true,
        hasRealSession: true,
      }),
    ).toBe("shell_ready");
  });
});
