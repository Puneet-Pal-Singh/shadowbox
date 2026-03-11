import {
  RoutingDetector,
  type RoutingDecision,
  type RoutingIntent,
} from "../../../../../packages/execution-engine/src/runtime/lib/RoutingDetector.js";

export type ChatIntent = RoutingIntent;
export type ChatRoutingDecision = RoutingDecision;

/**
 * ChatIntentDetector is a thin adapter over runtime RoutingDetector.
 * This keeps a single canonical routing contract across brain/runtime.
 */
export class ChatIntentDetector {
  static analyze(prompt: string): ChatRoutingDecision {
    return RoutingDetector.analyze(prompt);
  }

  static detectIntent(prompt: string): ChatIntent {
    return this.analyze(prompt).intent;
  }

  static shouldBypassPlanning(prompt: string): boolean {
    return this.analyze(prompt).bypass;
  }
}
