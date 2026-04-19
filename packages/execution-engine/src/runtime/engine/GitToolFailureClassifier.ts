import type { ToolActivityMetadata } from "@repo/shared-types";

export type GitToolFailureKind =
  | "recoverable_command_failure"
  | "bad_ref_or_checkout"
  | "missing_repo_state"
  | "missing_auth_state"
  | "unsupported_environment"
  | "policy_blocked"
  | "runtime_fatal";

export interface GitToolFailureInput {
  toolName: string;
  message: string;
  metadata?: ToolActivityMetadata;
}

export interface GitToolFailureDecision {
  kind: GitToolFailureKind;
  terminal: boolean;
}

const BAD_REF_PATTERNS = [
  /couldn['’]?t find remote ref/i,
  /pathspec .* did not match/i,
  /src refspec .* does not match any/i,
  /unknown revision or path not in the working tree/i,
  /ambiguous argument/i,
];

const MISSING_REPO_PATTERNS = [
  /not a git repository/i,
  /no such file or directory/i,
  /cannot change to/i,
  /unable to access .* no such file/i,
];

const MISSING_AUTH_PATTERNS = [
  /authentication failed/i,
  /could not read (username|password)/i,
  /permission denied \(publickey\)/i,
  /repository not found/i,
  /\b(401|403)\b/,
  /requires authentication/i,
  /gh auth/i,
];

const UNSUPPORTED_ENV_PATTERNS = [
  /command not found/i,
  /not installed/i,
  /executable file not found/i,
  /\benoent\b/i,
];

const POLICY_BLOCKED_PATTERNS = [
  /shadowbox wants to/i,
  /blocked by policy/i,
  /approval required/i,
  /permission denied by policy/i,
  /forbidden command/i,
];

const RUNTIME_FATAL_PATTERNS = [
  /runtime transport failed/i,
  /internal runtime error/i,
  /sandbox unavailable/i,
  /tool \"[^\"]+\" is not registered/i,
];

export class GitToolFailureClassifier {
  classify(input: GitToolFailureInput): GitToolFailureDecision {
    const combinedText = buildCombinedFailureText(input);
    if (matchesAny(combinedText, POLICY_BLOCKED_PATTERNS)) {
      return {
        kind: "policy_blocked",
        terminal: true,
      };
    }

    if (matchesAny(combinedText, RUNTIME_FATAL_PATTERNS)) {
      return {
        kind: "runtime_fatal",
        terminal: true,
      };
    }

    if (matchesAny(combinedText, BAD_REF_PATTERNS)) {
      return {
        kind: "bad_ref_or_checkout",
        terminal: false,
      };
    }

    if (matchesAny(combinedText, MISSING_REPO_PATTERNS)) {
      return {
        kind: "missing_repo_state",
        terminal: false,
      };
    }

    if (matchesAny(combinedText, MISSING_AUTH_PATTERNS)) {
      return {
        kind: "missing_auth_state",
        terminal: false,
      };
    }

    if (matchesAny(combinedText, UNSUPPORTED_ENV_PATTERNS)) {
      return {
        kind: "unsupported_environment",
        terminal: false,
      };
    }

    return {
      kind: "recoverable_command_failure",
      terminal: false,
    };
  }
}

export function shouldClassifyAsGitOrShellFailure(input: {
  toolName: string;
  metadata?: ToolActivityMetadata;
}): boolean {
  if (input.toolName === "bash") {
    return true;
  }

  if (input.metadata?.family !== "shell") {
    return false;
  }

  return /\b(?:git|gh)\b/i.test(input.metadata.command);
}

function buildCombinedFailureText(input: GitToolFailureInput): string {
  const parts = [input.message];

  if (input.metadata?.family === "shell") {
    parts.push(input.metadata.command);
    parts.push(input.metadata.stderr ?? "");
    parts.push(input.metadata.outputTail ?? "");
  }

  return parts.join("\n");
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}
