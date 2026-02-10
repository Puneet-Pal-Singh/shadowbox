/**
 * Intent Classification Rules
 *
 * Keywords and regex patterns for each intent type
 */
import { IntentType } from "./types.js";

/**
 * Keywords that indicate each intent type
 */
export const INTENT_KEYWORDS: Map<IntentType, string[]> = new Map([
  [
    IntentType.READ_CODE,
    ["explain", "what", "summarize", "read", "understand"],
  ],
  [
    IntentType.MODIFY_CODE,
    ["refactor", "change", "update", "fix", "add", "create"],
  ],
  [IntentType.DEBUG, ["error", "fail", "broken", "bug", "why", "crash"]],
  [IntentType.SEARCH, ["find", "locate", "search", "grep", "where"]],
  [IntentType.PLAN, ["plan", "how", "approach", "strategy"]],
  [IntentType.EXECUTE, ["run", "test", "build", "execute", "deploy"]],
  [IntentType.META, ["system", "you", "help", "version", "who"]],
]);

/**
 * Regex patterns that indicate each intent type
 */
export const INTENT_PATTERNS: Map<IntentType, string[]> = new Map([
  [IntentType.READ_CODE, ["how does .* work", "what is the purpose of"]],
  [IntentType.MODIFY_CODE, ["change .* to", "refactor this"]],
  [IntentType.DEBUG, ["why is .* failing", "fix the error in"]],
  [IntentType.SEARCH, ["where is .* defined", "find all occurrences of"]],
  [IntentType.PLAN, ["how should we", "what is the best way to"]],
  [IntentType.EXECUTE, ["run the tests", "build the project"]],
  [IntentType.META, ["what can you do", "how do you work"]],
]);

/**
 * Tool name to intent type mapping
 */
export const TOOL_TO_INTENT: Map<string, IntentType> = new Map([
  ["read_file", IntentType.READ_CODE],
  ["read_multiple_files", IntentType.READ_CODE],
  ["glob", IntentType.SEARCH],
  ["grep", IntentType.SEARCH],
  ["run_command", IntentType.EXECUTE],
  ["execute_code", IntentType.EXECUTE],
  ["write_file", IntentType.MODIFY_CODE],
  ["str_replace_based_edit_tool", IntentType.MODIFY_CODE],
]);

/**
 * Normalize text for classification
 * Lowercase and remove punctuation
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convert tool name to intent
 */
export function toolToIntent(toolName: string): IntentType | undefined {
  return TOOL_TO_INTENT.get(toolName);
}
