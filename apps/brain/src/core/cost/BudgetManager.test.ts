// apps/brain/src/core/cost/BudgetManager.test.ts
// Phase 3.1: Unit tests for BudgetManager

import { describe, it, expect, vi, beforeEach } from "vitest";
import { BudgetManager, BudgetExceededError } from "./BudgetManager";
import type { ICostTracker } from "./CostTracker";
import type { IPricingRegistry } from "./PricingRegistry";
import type { LLMUsage, BudgetConfig } from "./types";

describe("BudgetManager", () => {
  let mockCostTracker: ICostTracker;
  let mockPricingRegistry: IPricingRegistry;
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

    mockPricingRegistry = {
      getPrice: vi.fn(),
      calculateCost: vi.fn().mockReturnValue({
        inputCost: 0.01,
        outputCost: 0.005,
        totalCost: 0.015,
        currency: "USD",
        pricingSource: "registry",
      }),
      registerPrice: vi.fn(),
      loadFromJSON: vi.fn(),
      getAllPrices: vi.fn().mockReturnValue({}),
    };

    budgetManager = new BudgetManager(
      mockCostTracker,
      mockPricingRegistry,
      defaultConfig,
    );
  });

  describe("checkBudget", () => {
    it("should allow calls within budget", async () => {
      vi.mocked(mockPricingRegistry.calculateCost).mockReturnValue({
        inputCost: 0.01,
        outputCost: 0.005,
        totalCost: 0.1,
        currency: "USD",
        pricingSource: "registry",
      });

      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      };

      const result = await budgetManager.checkBudget("run-1", usage);

      expect(result.allowed).toBe(true);
      expect(result.currentCost).toBe(0);
      expect(result.projectedCost).toBe(0.1);
      expect(result.remainingBudget).toBe(1.0);
    });

    it("should deny calls that exceed budget", async () => {
      vi.mocked(mockCostTracker.getCurrentCost).mockResolvedValue(0.95);
      vi.mocked(mockPricingRegistry.calculateCost).mockReturnValue({
        inputCost: 0.1,
        outputCost: 0.1,
        totalCost: 0.2,
        currency: "USD",
        pricingSource: "registry",
      });

      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      };

      const result = await budgetManager.checkBudget("run-1", usage);

      expect(result.allowed).toBe(false);
      expect(result.currentCost).toBe(0.95);
      expect(result.projectedCost).toBe(1.15);
      expect(result.reason).toContain("Budget limit exceeded");
    });

    it("should use provided cost in usage if available", async () => {
      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        cost: 0.05, // Provider returns cost
      };

      const result = await budgetManager.checkBudget("run-1", usage);

      expect(result.allowed).toBe(true);
      expect(result.projectedCost).toBe(0.05);
      // Should not call pricing registry if cost is provided
      expect(mockPricingRegistry.calculateCost).not.toHaveBeenCalled();
    });

    it("should warn when approaching budget limit", async () => {
      vi.mocked(mockCostTracker.getCurrentCost).mockResolvedValue(0.85);
      vi.mocked(mockPricingRegistry.calculateCost).mockReturnValue({
        inputCost: 0.04,
        outputCost: 0.01,
        totalCost: 0.05,
        currency: "USD",
        pricingSource: "registry",
      });

      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
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
      const manager = new BudgetManager(mockCostTracker, mockPricingRegistry);
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

      const manager = new BudgetManager(
        mockCostTracker,
        mockPricingRegistry,
        customConfig,
      );
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
