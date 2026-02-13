// apps/brain/src/core/cost/BudgetManager.test.ts
// Phase 3.1: Unit tests for BudgetManager

import { describe, it, expect, vi, beforeEach } from "vitest";
import { BudgetManager, BudgetExceededError } from "./BudgetManager";
import type { ICostTracker } from "./CostTracker";
import type { LLMUsage, BudgetConfig } from "./types";

describe("BudgetManager", () => {
  let mockCostTracker: ICostTracker;
  let budgetManager: BudgetManager;
  const defaultConfig: BudgetConfig = {
    maxCostPerRun: 1.0, // $1.00 limit for testing
    maxCostPerSession: 5.0,
    warningThreshold: 0.8,
  };

  beforeEach(() => {
    mockCostTracker = {
      recordLLMUsage: vi.fn(),
      getCostEvents: vi.fn(),
      aggregateRunCost: vi.fn(),
      getCurrentCost: vi.fn().mockResolvedValue(0),
    };

    budgetManager = new BudgetManager(mockCostTracker, defaultConfig);
  });

  describe("checkBudget", () => {
    it("should allow calls within budget", async () => {
      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        cost: 0.1, // $0.10
      };

      const result = await budgetManager.checkBudget("run-1", usage);

      expect(result.allowed).toBe(true);
      expect(result.currentCost).toBe(0);
      expect(result.projectedCost).toBe(0.1);
      expect(result.remainingBudget).toBe(1.0);
    });

    it("should deny calls that exceed budget", async () => {
      // Set current cost close to limit
      vi.mocked(mockCostTracker.getCurrentCost).mockResolvedValue(0.95);

      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        cost: 0.2, // Would exceed $1.00 limit
      };

      const result = await budgetManager.checkBudget("run-1", usage);

      expect(result.allowed).toBe(false);
      expect(result.currentCost).toBe(0.95);
      expect(result.projectedCost).toBe(1.15);
      expect(result.reason).toContain("Budget limit exceeded");
    });

    it("should estimate cost when not provided", async () => {
      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        // cost is undefined
      };

      const result = await budgetManager.checkBudget("run-1", usage);

      expect(result.allowed).toBe(true);
      // Should estimate based on tokens
      expect(result.projectedCost).toBeGreaterThan(0);
    });

    it("should warn when approaching budget limit", async () => {
      // Set current cost at 85% of limit (above 80% warning threshold)
      vi.mocked(mockCostTracker.getCurrentCost).mockResolvedValue(0.85);

      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cost: 0.05,
      };

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await budgetManager.checkBudget("run-1", usage);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Budget warning"),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("getRemainingBudget", () => {
    it("should return full budget when no costs", async () => {
      const remaining = await budgetManager.getRemainingBudget("run-1");
      expect(remaining).toBe(1.0);
    });

    it("should return remaining budget after costs", async () => {
      vi.mocked(mockCostTracker.getCurrentCost).mockResolvedValue(0.3);

      const remaining = await budgetManager.getRemainingBudget("run-1");
      expect(remaining).toBe(0.7);
    });

    it("should return 0 when over budget", async () => {
      vi.mocked(mockCostTracker.getCurrentCost).mockResolvedValue(1.5);

      const remaining = await budgetManager.getRemainingBudget("run-1");
      expect(remaining).toBe(0);
    });
  });

  describe("isOverBudget", () => {
    it("should return false when under budget", async () => {
      vi.mocked(mockCostTracker.getCurrentCost).mockResolvedValue(0.5);

      const isOver = await budgetManager.isOverBudget("run-1");
      expect(isOver).toBe(false);
    });

    it("should return true when over budget", async () => {
      vi.mocked(mockCostTracker.getCurrentCost).mockResolvedValue(1.0);

      const isOver = await budgetManager.isOverBudget("run-1");
      expect(isOver).toBe(true);
    });

    it("should return true when exactly at budget limit", async () => {
      vi.mocked(mockCostTracker.getCurrentCost).mockResolvedValue(1.0);

      const isOver = await budgetManager.isOverBudget("run-1");
      expect(isOver).toBe(true);
    });
  });

  describe("configuration", () => {
    it("should use default config when none provided", () => {
      const manager = new BudgetManager(mockCostTracker);
      const config = manager.getConfig();

      expect(config.maxCostPerRun).toBe(5.0); // Default from DEFAULT_BUDGET
      expect(config.maxCostPerSession).toBe(20.0);
      expect(config.warningThreshold).toBe(0.8);
    });

    it("should allow custom config", () => {
      const customConfig: Partial<BudgetConfig> = {
        maxCostPerRun: 2.5,
        warningThreshold: 0.9,
      };

      const manager = new BudgetManager(mockCostTracker, customConfig);
      const config = manager.getConfig();

      expect(config.maxCostPerRun).toBe(2.5);
      expect(config.warningThreshold).toBe(0.9);
      expect(config.maxCostPerSession).toBe(20.0); // Default preserved
    });

    it("should update config dynamically", () => {
      budgetManager.updateConfig({ maxCostPerRun: 2.0 });
      const config = budgetManager.getConfig();

      expect(config.maxCostPerRun).toBe(2.0);
    });
  });
});
