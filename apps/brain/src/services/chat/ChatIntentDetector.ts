// apps/brain/src/services/chat/ChatIntentDetector.ts
// Delegates to execution-runtime RoutingDetector to keep one canonical contract.
import {
  RoutingDetector,
  type RoutingDecision,
  type RoutingIntent,
  type RoutingReasonCode,
} from "@shadowbox/execution-engine/runtime";

export type ChatIntent = RoutingIntent;
export type ChatIntentDecision = RoutingDecision;
export type ChatIntentReasonCode = RoutingReasonCode;

export class ChatIntentDetector {
  static analyze(prompt: string): ChatIntentDecision {
    return RoutingDetector.analyze(prompt);
  }

  static detectIntent(prompt: string): ChatIntent {
    return this.analyze(prompt).intent;
  }

  static shouldBypassPlanning(prompt: string): boolean {
    return this.analyze(prompt).bypass;
  }

  static requiresDiscoveryBeforeRead(prompt: string): boolean {
    return RoutingDetector.requiresDiscoveryBeforeRead(prompt);
  }
}
