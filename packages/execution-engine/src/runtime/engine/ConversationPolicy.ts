import { RoutingDetector } from "../lib/RoutingDetector.js";
import type { RepositoryContext } from "../types.js";

const ACTION_VERB_RE =
  /\b(read|check|view|open|analyze|inspect|review|edit|update|fix|search|find)\b/;
const REPO_FILE_NOUN_RE =
  /\b(file|files|document|doc|readme|code|repo|repository|branch)\b/;
const FILE_PATH_HINT_RE =
  /\b(?:\.{0,2}\/)?[\w.-]+(?:\/[\w.-]+)*\.[a-z0-9]{1,10}\b/;

export function shouldBypassPlanning(prompt: string): boolean {
  const decision = RoutingDetector.analyze(prompt);
  console.log(
    `[run/engine] Routing decision: bypass=${decision.bypass}, intent=${decision.intent}, reasonCode=${decision.reasonCode}, reason="${decision.reason}"`,
  );
  return decision.bypass;
}

export function buildConversationalSystemPrompt(now = new Date()): string {
  const nowIso = now.toISOString();
  return [
    "You are Shadowbox assistant in conversational chat mode.",
    "Answer the user directly in the first sentence, then add brief helpful details.",
    "Use a natural, friendly tone. Avoid robotic report phrasing.",
    'Do not start with phrases like "Based on the analysis", "The system", or "Based on completed tasks".',
    "Treat casual prompts as normal conversation.",
    "If asked about capabilities, answer in plain language about what you can help with.",
    "Do not fabricate tool execution, file access, command output, or repository inspection.",
    "Do not claim you analyzed files unless the user explicitly asked for file/repo operations in this turn.",
    "Do not mention internal run IDs, internal URLs, filesystem paths, or debug traces.",
    `Current runtime timestamp (UTC): ${nowIso}. If asked for date/time, use this timestamp as reference.`,
    "If the user asks about capabilities, describe what you can help with conversationally and ask for explicit permission/request before operational actions.",
  ].join("\n");
}

export function getActionClarificationMessage(
  prompt: string,
  repositoryContext?: RepositoryContext,
): string | null {
  const normalized = prompt.toLowerCase().trim();
  const asksForRepoOrFileAction =
    ACTION_VERB_RE.test(normalized) &&
    (REPO_FILE_NOUN_RE.test(normalized) || FILE_PATH_HINT_RE.test(normalized));

  if (asksForRepoOrFileAction && !hasRepositorySelection(repositoryContext)) {
    return "Sure. I can help with that, but I need you to select a repository first. Then share the file path if you want file-level analysis.";
  }
  return null;
}

export function hasRepositorySelection(
  repositoryContext?: RepositoryContext,
): boolean {
  return Boolean(repositoryContext?.owner?.trim() && repositoryContext.repo?.trim());
}
