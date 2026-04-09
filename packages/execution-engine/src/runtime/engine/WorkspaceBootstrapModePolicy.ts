import type { WorkspaceBootstrapMode } from "../types.js";
import { detectsMutation } from "./detectsMutation.js";

const GIT_WRITE_PROMPT_PATTERN =
  /\b(commit|stage|push|pull|fetch|sync|pull request|create pr|open pr|branch|checkout|merge|rebase|cherry-pick)\b/i;
const READ_ONLY_PROMPT_PATTERN =
  /\b(read|inspect|review|list|show|find|search|where|what|which|status|explain|analyze|audit|check)\b/i;

export function resolveWorkspaceBootstrapMode(
  prompt: string,
): WorkspaceBootstrapMode {
  if (isGitWritePrompt(prompt)) {
    return "git_write";
  }

  if (detectsMutation(prompt)) {
    return "mutation";
  }

  if (isExplicitReadOnlyPrompt(prompt)) {
    return "read_only";
  }

  return "mutation";
}

export function isGitWritePrompt(prompt: string): boolean {
  return GIT_WRITE_PROMPT_PATTERN.test(prompt);
}

export function isExplicitReadOnlyPrompt(prompt: string): boolean {
  return READ_ONLY_PROMPT_PATTERN.test(prompt);
}
