import { RoutingDetector } from "../lib/RoutingDetector.js";
import type { RepositoryContext } from "../types.js";

export function shouldBypassPlanning(prompt: string): boolean {
  const decision = RoutingDetector.analyze(prompt);
  console.log(
    `[run/engine] Routing decision: bypass=${decision.bypass}, intent=${decision.intent}, reasonCode=${decision.reasonCode}, reason="${decision.reason}"`,
  );
  return decision.bypass;
}

export function getDeterministicConversationalReply(
  prompt: string,
): string | null {
  const normalized = normalizeConversationalPrompt(prompt);
  if (/^(hey|hi|hello|howdy|greetings)[!.?]*$/.test(normalized)) {
    return "Hey! I'm ready to help with this repo. Tell me what you want to inspect or change.";
  }
  return null;
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
  if (
    RoutingDetector.requiresDiscoveryBeforeRead(normalized) &&
    hasRepositorySelection(repositoryContext)
  ) {
    return "I can help, but that target is ambiguous. First run a discovery step (list/search) and then request a specific file path to read.";
  }

  const asksForRepoOrFileAction =
    /\b(read|check|view|open|analyze|inspect|review|edit|update|fix|search|find)\b/.test(
      normalized,
    ) &&
    /\b(file|files|document|doc|readme|code|repo|repository|branch)\b/.test(
      normalized,
    );

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

function normalizeConversationalPrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/\s+/g, " ").trim();
}
