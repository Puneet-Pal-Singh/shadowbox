export type ShellStartupState =
  | "shell_locked_unauthenticated"
  | "shell_authenticated_setup"
  | "shell_authenticated_repo_missing"
  | "shell_ready";

export interface ResolveShellStartupStateInput {
  isAuthenticated: boolean;
  hasSetupRun: boolean;
  hasProviderConnection: boolean;
  hasRepoContext: boolean;
  hasRealSession: boolean;
}

export function resolveShellStartupState(
  input: ResolveShellStartupStateInput,
): ShellStartupState {
  if (!input.isAuthenticated) {
    return "shell_locked_unauthenticated";
  }

  if (
    input.hasRealSession &&
    input.hasRepoContext &&
    input.hasProviderConnection
  ) {
    return "shell_ready";
  }

  if (input.hasProviderConnection && !input.hasRepoContext) {
    return "shell_authenticated_repo_missing";
  }

  if (input.hasSetupRun || input.hasRepoContext || input.hasRealSession) {
    return "shell_authenticated_setup";
  }

  return "shell_authenticated_setup";
}
