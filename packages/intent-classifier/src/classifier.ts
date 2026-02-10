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
 * Confidence thresholds for score differences
 */
const CONFIDENCE_THRESHOLDS = {
  HIGH: 3,
  MEDIUM: 1,
} as const;

/**
 * Match keywords in normalized text using word boundaries
 */
function matchKeywords(
  normalized: string,
  signals: IntentSignal[],
  matchCounts: Map<IntentType, number>,
): void {
  for (const [intent, keywords] of INTENT_KEYWORDS) {
    let count = 0;
    for (const keyword of keywords) {
      // Use word boundary regex to avoid false positives (e.g., "how" matching "show")
      const regex = new RegExp(`\\b${keyword}\\b`);
      if (regex.test(normalized)) {
        signals.push({ type: "keyword", value: keyword, intent });
        count++;
      }
    }
    if (count > 0) {
      matchCounts.set(intent, (matchCounts.get(intent) || 0) + count);
    }
  }
}

/**
 * Match regex patterns in normalized text
 */
function matchPatterns(
  normalized: string,
  signals: IntentSignal[],
  matchCounts: Map<IntentType, number>,
): void {
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
}

/**
 * Extract context signals from recent tool calls
 */
function matchContext(
  recentToolCalls: Array<{ toolName: string }> | undefined,
  signals: IntentSignal[],
  matchCounts: Map<IntentType, number>,
): void {
  if (!recentToolCalls || recentToolCalls.length === 0) {
    return;
  }

  const lastTool = recentToolCalls[recentToolCalls.length - 1]?.toolName;
  if (!lastTool) {
    return;
  }

  const contextIntent = toolToIntent(lastTool);
  if (contextIntent) {
    signals.push({
      type: "context",
      value: lastTool,
      intent: contextIntent,
    });
    matchCounts.set(contextIntent, (matchCounts.get(contextIntent) || 0) + 1);
  }
}

/**
 * Select primary intent with tie-breaking
 * Returns sorted intents and max score to avoid duplicate sorting in caller
 */
function selectPrimaryIntent(
  matchCounts: Map<IntentType, number>,
): { primary: IntentType; maxScore: number; sortedIntents: Array<[IntentType, number]> } {
  const sortedIntents = Array.from(matchCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return SAFETY_PRIORITY.indexOf(a[0]) - SAFETY_PRIORITY.indexOf(b[0]);
  });

  const first = sortedIntents[0];
  if (first) {
    return { primary: first[0], maxScore: first[1], sortedIntents };
  }

  return { primary: IntentType.READ_CODE, maxScore: -1, sortedIntents };
}

/**
 * Calculate confidence based on score difference
 */
function calculateConfidence(
  sortedIntents: Array<[IntentType, number]>,
  maxScore: number,
): "low" | "medium" | "high" {
  if (sortedIntents.length === 0) {
    return "low";
  }

  const secondScore = sortedIntents[1]?.[1] ?? 0;
  const diff = maxScore - secondScore;

  if (diff > CONFIDENCE_THRESHOLDS.HIGH) {
    return "high";
  }

  if (diff >= CONFIDENCE_THRESHOLDS.MEDIUM) {
    return "medium";
  }

  return "low";
}

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

  // Match signals from keywords, patterns, and context
  matchKeywords(normalized, signals, matchCounts);
  matchPatterns(normalized, signals, matchCounts);
  matchContext(input.recentToolCalls, signals, matchCounts);

  // Select primary intent with tie-breaking
  const { primary, maxScore, sortedIntents } = selectPrimaryIntent(matchCounts);

  // Calculate confidence
  const confidence = calculateConfidence(sortedIntents, maxScore);

  return {
    primary,
    confidence,
    signals,
  };
}
