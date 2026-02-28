/**
 * RoutingDetector: Unified conversational vs action intent detection
 *
 * This service provides a single source of truth for routing decisions.
 * It mirrors the logic in @shadowbox/brain/ChatIntentDetector but is
 * standalone to avoid circular dependencies.
 */

export type RoutingIntent = "conversational" | "action" | "unknown";

export interface RoutingDecision {
  intent: RoutingIntent;
  bypass: boolean;
  reason: string;
}

export class RoutingDetector {
  /**
   * Detect intent and determine if planning should be bypassed
   */
  static analyze(prompt: string): RoutingDecision {
    const normalized = prompt.toLowerCase().trim();

    // Strip conversational lead-ins before analysis
    const cleanedPrompt = this.stripConversationalLeadIns(normalized);

    // Action patterns (explicit file/code/workspace operations)
    // Action takes precedence over conversational tone.
    if (this.isAction(normalized)) {
      return {
        intent: "action",
        bypass: false,
        reason: "detected action pattern",
      };
    }

    // Conversational patterns (no action requested)
    if (this.isConversational(cleanedPrompt)) {
      return {
        intent: "conversational",
        bypass: true,
        reason: "detected conversational pattern",
      };
    }

    if (
      this.isShortConversationalUtterance(cleanedPrompt) &&
      !this.isAction(cleanedPrompt)
    ) {
      return {
        intent: "conversational",
        bypass: true,
        reason: "short utterance without action keywords",
      };
    }

    // Default to conversational unless action is explicit.
    // This avoids turning normal chat into unnecessary task plans.
    return {
      intent: "conversational",
      bypass: true,
      reason: "no explicit action pattern detected",
    };
  }

  static shouldBypassPlanning(prompt: string): boolean {
    return this.analyze(prompt).bypass;
  }

  private static stripConversationalLeadIns(normalized: string): string {
    return normalized
      .replace(/^(so|well|hmm|uh+|um+|ok(?:ay)?)\b[\s,!?-]*/i, "")
      .trim();
  }

  private static isConversational(normalized: string): boolean {
    // Very short utterances (just "?" or single word) - conversational by default
    if (normalized.length <= 3 && /^(\?+|[a-z]+\??)?$/.test(normalized)) {
      return true;
    }

    // Single-word question prompts should stay conversational.
    // Example: "how?" should not trigger full planning/task execution.
    if (/^(how|why|what|who|when|where)\?+$/i.test(normalized)) {
      return true;
    }

    // Simple greetings and acknowledgments
    const greetings = [
      /^(hey|hi|hello|howdy|greetings)\??(\s|$)/,
      /^(great|cool|nice|awesome|excellent|perfect)\??(\s|$)/,
      /^(ok|okay|sure|alright|yep|yup)\??(\s|$)/,
      /^how\s+(are|r)\s+(u|you)/,
      /^what('?s|\s+is)\s+(your\s+)?(name|goal|purpose)/,
      /^(thanks|thank you|thx|ty)(\s|$)/,
      /^(good\s+(morning|afternoon|evening|night)|bye|goodbye|see you)/,
    ];

    for (const pattern of greetings) {
      if (pattern.test(normalized)) {
        return true;
      }
    }

    // General knowledge questions without action keywords
    const knowledgeQuestions = [
      /^what\s+is\s+/,
      /^explain\s+/,
      /^how\s+does\s+/,
      /^why\s+/,
      /^what\s+are\s+(the\s+)?(benefits|advantages|differences|pros)/,
    ];

    if (knowledgeQuestions.some((p) => p.test(normalized))) {
      // Only conversational if no action keywords present
      if (!this.hasActionKeywords(normalized)) {
        return true;
      }
    }

    return false;
  }

  private static isAction(normalized: string): boolean {
    const imperativeActionVerb =
      "(read|check|view|analyze|examine|inspect|show|create|write|add|edit|modify|update|change|fix|delete|remove|run|execute|implement|refactor|optimize|lint|format|compile|transpile|debug|investigate)";

    const actionPatterns = [
      // Imperative command-style prompts
      new RegExp(`^(please\\s+)?${imperativeActionVerb}\\b`, "i"),
      new RegExp(`\\b(can you|could you|would you|please)\\s+${imperativeActionVerb}\\b`, "i"),

      // File operations - read/check/view file operations
      /\b(read|check|view|analyze|examine|inspect|look at|show me)\s+(file|README|config|src|test)/i,
      // File operations - create/edit operations
      /\b(create|write|add|edit|modify|update|change|fix)\s+(file|code|function|class|test|README)/i,
      // File operations - delete operations
      /\b(delete|remove|rm|mkdir|make)\s+(file|directory|dir|folder)/i,

      // Git operations
      /\bgit\s+(commit|push|pull|merge|branch|checkout|add|status|diff|log|rebase|cherry-pick)\b/i,
      /\b(commit|push|pull|merge|branch|checkout|rebase|cherry-pick)\b/i,
      /\b(version control|source control)\b/i,

      // Test operations
      /\b(test|run tests|npm test|jest|mocha|vitest)\b/i,
      /\b(fix.*failing|make.*pass|debug.*test)\b/i,

      // Execution
      /\b(run|execute|exec|npm|yarn|pnpm|node|npx)\s+/i,
      /\bsh(ell)?.*command\b/i,

      // Code-specific
      /\b(implement|refactor|optimize|lint|format|compile|transpile)\b/i,
      /\b(console|error|warn|debug|throw|exception|stack trace)\b/i,

      // Workspace awareness
      /\b(in this (project|repo|workspace)|codebase|repository)\b/i,
      /(src\/|tests\/|lib\/|docs\/|scripts\/|package\.json|tsconfig)/i,
    ];

    return actionPatterns.some((p) => p.test(normalized));
  }

  private static hasActionKeywords(normalized: string): boolean {
     // Action keywords that indicate file/code operations
     // Use word boundaries (\b) to avoid false positives like "bread" containing "read"
     const actionKeywordPatterns = [
       /\b(file|read|write|edit|create|delete|update|modify|test|run|commit|push|pull|check|npm|yarn|pnpm|command|execute)\b/,
       /src\//,
     ];

     // Note: Excluded "code", "git", "analyze" as they can be used in academic contexts
     return actionKeywordPatterns.some((pattern) => pattern.test(normalized));
   }

  private static isShortConversationalUtterance(normalized: string): boolean {
    if (normalized.includes("?")) {
      return false;
    }

    const tokenCount = normalized.split(/\s+/).filter(Boolean).length;
    if (tokenCount === 0 || tokenCount > 3 || normalized.length > 24) {
      return false;
    }

    if (/[\/\\]|package\.json|readme|tsconfig|src\/|tests\//i.test(normalized)) {
      return false;
    }

    if (/^[a-z]+\s+-/.test(normalized)) {
      return false;
    }

    if (
      /\b(read|check|view|analyze|examine|inspect|show|create|write|add|edit|modify|update|change|fix|delete|remove|run|execute|exec|test|commit|push|pull|merge|branch|checkout|stage|install|build|deploy)\b/i.test(
        normalized,
      )
    ) {
      return false;
    }

    return true;
  }
}
