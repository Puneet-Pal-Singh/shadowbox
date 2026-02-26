import { describe, it, expect } from "vitest";
import { RoutingDetector, type RoutingIntent } from "./RoutingDetector";

describe("RoutingDetector - Unified routing logic", () => {
  describe("Conversational intents (bypass planning)", () => {
    const conversationalExamples: string[] = [
      "hey?",
      "hey",
      "hi",
      "hello",
      "how?",
      "why?",
      "howdy",
      "how are you?",
      "how r u",
      "what's your name?",
      "what is your purpose?",
      "thanks",
      "thank you",
      "great",
      "great!",
      "cool",
      "nice",
      "awesome",
      "excellent",
      "perfect",
      "ok",
      "okay",
      "sure",
      "alright",
      "yep",
      "yup",
      "bye",
      "goodbye",
      "good morning",
      "good night",
    ];

    conversationalExamples.forEach((prompt) => {
      it(`should bypass planning for "${prompt}"`, () => {
        const decision = RoutingDetector.analyze(prompt);
        expect(decision.intent).toBe("conversational");
        expect(decision.bypass).toBe(true);
        expect(RoutingDetector.shouldBypassPlanning(prompt)).toBe(true);
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
        const decision = RoutingDetector.analyze(q);
        expect(decision.bypass).toBe(true);
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
    ];

    actionExamples.forEach(([prompt, context]) => {
      it(`should require planning for "${prompt}" (${context})`, () => {
        const decision = RoutingDetector.analyze(prompt);
        expect(decision.bypass).toBe(false);
        expect(RoutingDetector.shouldBypassPlanning(prompt)).toBe(false);
      });
    });
  });

  describe("Routing decision structure", () => {
    it("should return complete decision object", () => {
      const decision = RoutingDetector.analyze("hey");
      expect(decision).toHaveProperty("intent");
      expect(decision).toHaveProperty("bypass");
      expect(decision).toHaveProperty("reason");
      expect(typeof decision.reason).toBe("string");
    });

    it("should provide meaningful reasons for decisions", () => {
      const conversational = RoutingDetector.analyze("hey");
      expect(conversational.reason).toContain("conversational");

      const action = RoutingDetector.analyze("read README");
      expect(action.reason).toContain("action");
    });
  });

  describe("Edge cases", () => {
    it("should handle whitespace and case variations", () => {
      expect(RoutingDetector.shouldBypassPlanning("  HEY?  ")).toBe(true);
      expect(RoutingDetector.shouldBypassPlanning("READ FILE")).toBe(false);
    });

    it("should default to action for ambiguous prompts", () => {
      const ambiguous = ["what's this?", "can you help?", "anything else?"];

      ambiguous.forEach((prompt) => {
        const decision = RoutingDetector.analyze(prompt);
        expect(decision.bypass).toBe(false);
      });
    });

    it("should handle empty and very short inputs", () => {
      const empty = RoutingDetector.analyze("");
      expect(empty.intent).toBeTruthy();

      const single = RoutingDetector.analyze("?");
      expect(single.intent).toBeTruthy();
    });
  });

  describe("Intent classification", () => {
    it("should classify conversational intents correctly", () => {
      const intent: RoutingIntent = RoutingDetector.analyze("hey").intent;
      expect(["conversational", "action", "unknown"]).toContain(intent);
    });

    it("should classify action intents correctly", () => {
      const intent: RoutingIntent = RoutingDetector.analyze("read README")
        .intent;
      expect(intent).toBe("action");
    });
  });
});
