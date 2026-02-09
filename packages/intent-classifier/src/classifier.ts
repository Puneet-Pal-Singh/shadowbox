/**
 * Intent Classifier
 *
 * Deterministic, rule-based intent classification
 * Phase 1: observational only, no context mutation
 */
import {
  IntentType,
  IntentSignal,
  IntentClassification,
  ClassifierInput,
} from "./types.js";
import {
  INTENT_KEYWORDS,
  INTENT_PATTERNS,
  normalize,
  toolToIntent,
} from "./rules.js";

/**
 * Tie-breaking priority (safer intents first)
 */
const SAFETY_PRIORITY: IntentType[] = [
  IntentType.READ_CODE,
  IntentType.SEARCH,
  IntentType.PLAN,
  IntentType.META,
  IntentType.DEBUG,
  IntentType.EXECUTE,
  IntentType.MODIFY_CODE,
];

/**
 * Classify user intent based on message and context
 *
 * @param input - Classification input
 * @returns Intent classification result
 */
export function classifyIntent(input: ClassifierInput): IntentClassification {
  const normalized = normalize(input.message);
  const signals: IntentSignal[] = [];
  const matchCounts = new Map<IntentType, number>();

  // Keyword matching
  for (const [intent, keywords] of INTENT_KEYWORDS) {
    let count = 0;
    for (const keyword of keywords) {
      if (normalized.includes(keyword)) {
        signals.push({ type: "keyword", value: keyword, intent });
        count++;
      }
    }
    if (count > 0) {
      matchCounts.set(intent, (matchCounts.get(intent) || 0) + count);
    }
  }

  // Pattern matching (implicit priority: patterns > keywords)
  for (const [intent, patterns] of INTENT_PATTERNS) {
    let count = 0;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern, "i");
      const match = normalized.match(regex);
      if (match) {
        signals.push({ type: "pattern", value: match[0], intent });
        count++;
      }
    }
    if (count > 0) {
      matchCounts.set(intent, (matchCounts.get(intent) || 0) + count);
    }
  }

  // Context matching from recent tool calls
  if (input.recentToolCalls && input.recentToolCalls.length > 0) {
    const lastTool =
      input.recentToolCalls[input.recentToolCalls.length - 1]?.toolName;
    if (lastTool) {
      const contextIntent = toolToIntent(lastTool);
      if (contextIntent) {
        signals.push({
          type: "context",
          value: lastTool,
          intent: contextIntent,
        });
        matchCounts.set(
          contextIntent,
          (matchCounts.get(contextIntent) || 0) + 1,
        );
      }
    }
  }

  // Selection with tie-breaking
  let primary: IntentType = IntentType.READ_CODE;
  let maxScore = -1;

  const sortedIntents = Array.from(matchCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return SAFETY_PRIORITY.indexOf(a[0]) - SAFETY_PRIORITY.indexOf(b[0]);
  });

  const first = sortedIntents[0];
  const second = sortedIntents[1];

  if (first) {
    primary = first[0];
    maxScore = first[1];
  }

  // Confidence calculation
  const secondScore = second?.[1] ?? 0;
  const diff = maxScore - secondScore;

  let confidence: "low" | "medium" | "high";
  if (sortedIntents.length === 0) {
    confidence = "low";
  } else if (diff > 3) {
    confidence = "high";
  } else if (diff >= 1) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return {
    primary,
    confidence,
    signals,
  };
}
