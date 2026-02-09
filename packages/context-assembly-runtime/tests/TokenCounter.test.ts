import { describe, it, expect } from "vitest";
import { TokenCounter } from "../src/TokenCounter.js";

describe("TokenCounter", () => {
  describe("determinism", () => {
    it("should return consistent results for same input", () => {
      const counter = new TokenCounter();
      const text = "Hello world, this is a test string.";

      const result1 = counter.count(text);
      const result2 = counter.count(text);
      const result3 = counter.count(text);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it("should use consistent character-to-token ratio", () => {
      const counter = new TokenCounter(4); // 4 chars = 1 token

      expect(counter.count("")).toBe(0);
      expect(counter.count("abcd")).toBe(1);
      expect(counter.count("abcde")).toBe(2);
      expect(counter.count("abcdefgh")).toBe(2);
    });
  });

  describe("empty input", () => {
    it("should return 0 for empty string", () => {
      const counter = new TokenCounter();
      expect(counter.count("")).toBe(0);
    });

    it("should return 0 for empty batch", () => {
      const counter = new TokenCounter();
      expect(counter.countBatch([])).toBe(0);
    });
  });

  describe("batch counting", () => {
    it("should sum token counts for multiple strings", () => {
      const counter = new TokenCounter(4);
      const texts = ["abcd", "efgh", "ij"];

      expect(counter.countBatch(texts)).toBe(3); // 1 + 1 + 1 = 3
    });
  });
});
