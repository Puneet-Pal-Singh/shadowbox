import type { CoreMessage } from "ai";
import { detectsMutation } from "./detectsMutation.js";
import { isExplicitReadOnlyPrompt } from "./WorkspaceBootstrapModePolicy.js";

export type CurrentTurnIntent = "read_only" | "mutation" | "mixed";
export type LocalDiffRelevance = "relevant" | "unrelated" | "ambiguous";

const BROAD_CHANGE_SCOPE_PATTERN =
  /\b(current|pending|local|existing|all|these)\s+(changes|edits?)\b/i;
const REVIEW_INSPECT_PATTERN =
  /\b(ci|checks?|review comments?|pull request|pr\b|workflow|actions|logs?)\b/i;
const PUBLISH_MUTATION_PATTERN =
  /\b(stage|commit|push|publish|(?:open|create)\s+pr|create\s+branch|checkout|merge|rebase|cherry-pick)\b/i;
const CONTINUATION_PROMPT_PATTERN =
  /^\s*(?:continue|continue\?|go on|resume|retry|try again|finish (?:it|that)|do it|same repo|pick up where you left off)\b/i;
const FILE_PATH_MENTION_PATTERN =
  /\b[\w./-]+\.[a-z0-9]+\b/gi;
const TOKEN_PATTERN = /[a-z0-9]+/g;
const STOPWORD_TOKENS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "about",
  "after",
  "before",
  "then",
  "please",
  "check",
  "show",
  "list",
  "review",
  "commit",
  "push",
  "stage",
  "changes",
  "change",
  "files",
  "file",
  "update",
  "fix",
  "edit",
]);

export function classifyCurrentTurnIntent(prompt: string): CurrentTurnIntent {
  const normalizedPrompt = prompt.trim().toLowerCase();
  if (!normalizedPrompt) {
    return "read_only";
  }

  if (CONTINUATION_PROMPT_PATTERN.test(normalizedPrompt)) {
    return "mixed";
  }

  const hasMutationIntent =
    detectsMutation(normalizedPrompt) ||
    PUBLISH_MUTATION_PATTERN.test(normalizedPrompt);
  const hasReadOnlyIntent =
    isExplicitReadOnlyPrompt(normalizedPrompt) ||
    REVIEW_INSPECT_PATTERN.test(normalizedPrompt);

  if (hasMutationIntent && hasReadOnlyIntent) {
    return "mixed";
  }

  if (hasMutationIntent) {
    return "mutation";
  }

  return "read_only";
}

export function classifyCurrentTurnIntentFromMessages(
  initialMessages: CoreMessage[],
): CurrentTurnIntent {
  const latestUserMessage = [...initialMessages]
    .reverse()
    .find((message) => message.role === "user");
  if (!latestUserMessage) {
    return "read_only";
  }

  return classifyCurrentTurnIntent(extractTextParts(latestUserMessage.content));
}

export function requiresMutationForIntent(intent: CurrentTurnIntent): boolean {
  return intent === "mutation" || intent === "mixed";
}

export function classifyLocalDiffRelevance(input: {
  prompt: string;
  changedFiles: string[];
  requestedFiles?: string[];
}): LocalDiffRelevance {
  const normalizedPrompt = input.prompt.trim().toLowerCase();
  const changedFiles = normalizePaths(input.changedFiles);
  if (changedFiles.length === 0) {
    return "ambiguous";
  }

  const requestedFiles = normalizePaths(input.requestedFiles ?? []);
  if (requestedFiles.length > 0) {
    const matchingRequestedFiles = requestedFiles.filter((requestedPath) =>
      changedFiles.some((changedPath) => matchesPath(changedPath, requestedPath)),
    );

    if (matchingRequestedFiles.length === requestedFiles.length) {
      return "relevant";
    }

    if (matchingRequestedFiles.length === 0) {
      return "unrelated";
    }

    return "ambiguous";
  }

  const promptFileMentions = normalizePaths(
    [...normalizedPrompt.matchAll(FILE_PATH_MENTION_PATTERN)].map(
      (match) => match[0] ?? "",
    ),
  );
  if (promptFileMentions.length > 0) {
    const hasPromptPathMatch = promptFileMentions.some((mention) =>
      changedFiles.some((changedPath) => matchesPath(changedPath, mention)),
    );
    return hasPromptPathMatch ? "relevant" : "unrelated";
  }

  if (BROAD_CHANGE_SCOPE_PATTERN.test(normalizedPrompt)) {
    return "relevant";
  }

  const promptTokens = extractPathTokens(normalizedPrompt);
  const changedFileTokens = changedFiles.flatMap(extractPathTokens);
  const hasTokenOverlap = promptTokens.some((token) =>
    changedFileTokens.includes(token),
  );
  if (hasTokenOverlap) {
    return "relevant";
  }

  if (changedFiles.length === 1) {
    return "relevant";
  }

  return "ambiguous";
}

function extractTextParts(content: CoreMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter(
      (
        part,
      ): part is {
        type: "text";
        text: string;
      } => part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("\n");
}

function normalizePaths(paths: string[]): string[] {
  const normalized = paths
    .map((path) => path.trim().replace(/\\+/g, "/"))
    .filter((path) => path.length > 0);
  return [...new Set(normalized)];
}

function matchesPath(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }

  return left.endsWith(`/${right}`) || right.endsWith(`/${left}`);
}

function extractPathTokens(value: string): string[] {
  const tokens = value.match(TOKEN_PATTERN) ?? [];
  return tokens.filter((token) => token.length > 2 && !STOPWORD_TOKENS.has(token));
}
