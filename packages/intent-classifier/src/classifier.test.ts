import { describe, it, expect } from "vitest";
import { classifyIntent } from "../src/classifier.js";
import { normalize } from "../src/rules.js";
import { IntentType } from "../src/types.js";

describe("IntentClassifier", () => {
  describe("normalize", () => {
    it("should lowercase text", () => {
      expect(normalize("HELLO")).toBe("hello");
    });

    it("should remove punctuation", () => {
      expect(normalize("hello, world!")).toBe("hello world");
    });

    it("should collapse multiple spaces", () => {
      expect(normalize("hello   world")).toBe("hello world");
    });
  });

  describe("determinism", () => {
    it("should produce same output for same input", () => {
      const input = {
        message: "Explain how the authentication works",
      };

      const result1 = classifyIntent(input);
      const result2 = classifyIntent(input);
      const result3 = classifyIntent(input);

      expect(result1.primary).toBe(result2.primary);
      expect(result2.primary).toBe(result3.primary);
      expect(result1.confidence).toBe(result2.confidence);
      expect(result2.confidence).toBe(result3.confidence);
      expect(result1.signals).toEqual(result2.signals);
      expect(result2.signals).toEqual(result3.signals);
    });

    it("should produce same result with same keywords in different order", () => {
      const input1 = { message: "explain and understand the code" };
      const input2 = { message: "understand and explain the code" };

      const result1 = classifyIntent(input1);
      const result2 = classifyIntent(input2);

      expect(result1.primary).toBe(result2.primary);
    });
  });

  describe("obvious intent cases", () => {
    it("should detect READ_CODE for explain query", () => {
      const result = classifyIntent({
        message: "Explain how the authentication works",
      });
      expect(result.primary).toBe(IntentType.READ_CODE);
      expect(
        result.signals.some(
          (s) => s.type === "keyword" && s.value === "explain",
        ),
      ).toBe(true);
    });

    it("should detect MODIFY_CODE for refactor query", () => {
      const result = classifyIntent({
        message: "Refactor this function to be more efficient",
      });
      expect(result.primary).toBe(IntentType.MODIFY_CODE);
      expect(
        result.signals.some(
          (s) => s.type === "keyword" && s.value === "refactor",
        ),
      ).toBe(true);
    });

    it("should detect DEBUG for error query", () => {
      const result = classifyIntent({
        message: "Why is the build failing with this error",
      });
      expect(result.primary).toBe(IntentType.DEBUG);
    });

    it("should detect SEARCH for find query", () => {
      const result = classifyIntent({
        message: "Find all occurrences of the userId variable",
      });
      expect(result.primary).toBe(IntentType.SEARCH);
    });

    it("should detect PLAN for how query", () => {
      const result = classifyIntent({
        message: "How should we implement the new feature",
      });
      expect(result.primary).toBe(IntentType.PLAN);
    });

    it("should detect EXECUTE for run query", () => {
      const result = classifyIntent({
        message: "Run the tests to verify the fix",
      });
      expect(result.primary).toBe(IntentType.EXECUTE);
    });

    it("should detect META for system question", () => {
      const result = classifyIntent({ message: "What can you do?" });
      expect(result.primary).toBe(IntentType.META);
    });
  });

  describe("pattern matching", () => {
    it("should match regex patterns", () => {
      const result = classifyIntent({
        message: "How does the auth middleware work",
      });
      expect(result.primary).toBe(IntentType.READ_CODE);
      expect(
        result.signals.some(
          (s) => s.type === "pattern" && s.value.includes("how does"),
        ),
      ).toBe(true);
    });

    it("should prioritize patterns over keywords", () => {
      const result = classifyIntent({
        message: "why is the build failing right now",
      });
      expect(result.primary).toBe(IntentType.DEBUG);
    });
  });

  describe("context from recent tool calls", () => {
    it("should use recent tool context", () => {
      const result = classifyIntent({
        message: "What should we do next",
        recentToolCalls: [{ toolName: "read_file" }],
      });
      expect(
        result.signals.some(
          (s) => s.type === "context" && s.value === "read_file",
        ),
      ).toBe(true);
    });

    it("should add context signal when no keywords match", () => {
      const result = classifyIntent({
        message: "What should we do next",
        recentToolCalls: [{ toolName: "grep" }],
      });

      expect(result.signals.some((s) => s.type === "context")).toBe(true);
    });
  });

  describe("confidence levels", () => {
    it("should have high confidence for multiple matching keywords", () => {
      const result = classifyIntent({
        message: "explain read understand summarize",
      });
      expect(result.confidence).toBe("high");
    });

    it("should have medium confidence for single keyword match", () => {
      const result = classifyIntent({ message: "test" });
      expect(result.confidence).toBe("medium");
    });

    it("should have medium confidence for tie with small difference", () => {
      const result = classifyIntent({ message: "test and run" });
      expect(result.confidence).toBe("medium");
    });
  });

  describe("tie-breaking", () => {
    it("should prefer READ_CODE in ties", () => {
      const result = classifyIntent({ message: "test and explain" });
      expect(result.primary).toBe(IntentType.READ_CODE);
    });

    it("should prefer safer intents in ties", () => {
      const result = classifyIntent({ message: "run explain" });
      expect(result.primary).toBe(IntentType.READ_CODE);
    });
  });

  describe("edge cases", () => {
    it("should handle empty message", () => {
      const result = classifyIntent({ message: "" });
      expect(result.primary).toBe(IntentType.READ_CODE);
      expect(result.confidence).toBe("low");
      expect(result.signals).toHaveLength(0);
    });

    it("should handle message with no matching keywords", () => {
      const result = classifyIntent({ message: "xyz abc qwerty" });
      expect(result.primary).toBe(IntentType.READ_CODE);
      expect(result.confidence).toBe("low");
    });

    it("should handle no recentToolCalls", () => {
      const result = classifyIntent({
        message: "Explain the code",
      });
      expect(result.primary).toBe(IntentType.READ_CODE);
    });
  });
});
