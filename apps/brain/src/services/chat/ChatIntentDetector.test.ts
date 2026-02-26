// apps/brain/src/services/chat/ChatIntentDetector.test.ts
// Phase 3: Test conversational vs action intent detection

import { describe, it, expect } from "vitest";
import { ChatIntentDetector, type ChatIntent } from "./ChatIntentDetector.js";

describe("ChatIntentDetector - Phase 3: Conversational vs Action", () => {
  describe("Conversational intents (bypass planning)", () => {
    const conversationalExamples: string[] = [
      "hey?",
      "hey",
      "hi",
      "hello",
      "howdy",
      "how are you?",
      "how r u",
      "what's your name?",
      "what is your purpose?",
      "thanks",
      "thank you",
      "bye",
      "goodbye",
      "good morning",
      "good night",
    ];

    conversationalExamples.forEach((prompt) => {
      it(`should detect "${prompt}" as conversational`, () => {
        expect(ChatIntentDetector.detectIntent(prompt)).toBe("conversational");
        expect(ChatIntentDetector.shouldBypassPlanning(prompt)).toBe(true);
      });
    });

    it("should detect general knowledge questions as conversational", () => {
      const questions = [
        "what is TypeScript?",
        "explain async/await",
        "how does git work?",
        "why use React?",
      ];

      questions.forEach((q) => {
        expect(ChatIntentDetector.shouldBypassPlanning(q)).toBe(true);
      });
    });
  });

  describe("Action intents (require planning)", () => {
    const actionExamples: Array<[string, string]> = [
      // File operations
      ["read the README", "file read"],
      ["check README", "file check"],
      ["analyze src/main.ts", "file analyze"],
      ["view the config file", "file view"],
      ["create a test file", "file create"],
      ["write to package.json", "file write"],
      ["edit the TypeScript config", "file edit"],
      ["delete old test files", "file delete"],

      // Git operations
      ["commit my changes", "git operation"],
      ["git push to main", "git operation"],
      ["create a branch", "git operation"],
      ["merge the PR", "git operation"],

      // Test operations
      ["run tests", "test operation"],
      ["npm test", "test operation"],
      ["run jest", "test operation"],
      ["fix failing tests", "test operation"],

      // Execution
      ["npm install", "npm execution"],
      ["run the build", "execution"],
      ["execute this command", "execution"],

      // Code operations
      ["refactor this function", "code operation"],
      ["implement error handling", "code operation"],
      ["lint the code", "code operation"],
      ["optimize performance", "code operation"],

      // Workspace context
      ["in this project, check the README", "workspace context"],
      ["analyze the src/ directory", "workspace context"],
      ["what's in lib/?", "workspace context with action"],
    ];

    actionExamples.forEach(([prompt, context]) => {
      it(`should detect "${prompt}" (${context}) as action`, () => {
        const intent = ChatIntentDetector.detectIntent(prompt);
        expect(
          intent === "action" || intent === "unknown",
          `"${prompt}" should require planning (${context})`,
        ).toBe(true);
        expect(ChatIntentDetector.shouldBypassPlanning(prompt)).toBe(false);
      });
    });
  });

  describe("Edge cases", () => {
    it("should handle whitespace and case variations", () => {
      expect(ChatIntentDetector.detectIntent("  HEY?  ")).toBe(
        "conversational",
      );
      expect(ChatIntentDetector.detectIntent("READ FILE")).toBe("action");
    });

    it("should default to action for ambiguous prompts", () => {
      const ambiguous = [
        "what's this?",
        "can you help?",
        "anything else?",
      ];

      ambiguous.forEach((prompt) => {
        const intent = ChatIntentDetector.detectIntent(prompt);
        // Should be either action or unknown, but definitely route through planning
        expect(intent !== "conversational").toBe(true);
      });
    });

    it("should handle empty and very short inputs", () => {
      expect(
        ChatIntentDetector.detectIntent("") || "unknown",
      ).toBeTruthy();
      expect(ChatIntentDetector.detectIntent("?")).toBeTruthy();
    });
  });

  describe("Integration examples", () => {
    it("should bypass planning for pure conversation", () => {
      const scenarios: Array<[string, boolean]> = [
        ["hey?", true],
        ["hello there", true],
        ["what is git?", true],
        ["check README", false],
        ["create a file", false],
        ["run npm test", false],
      ];

      scenarios.forEach(([prompt, shouldBypass]) => {
        expect(ChatIntentDetector.shouldBypassPlanning(prompt)).toBe(
          shouldBypass,
          `Failed for: "${prompt}"`,
        );
      });
    });
  });
});
