// apps/brain/src/core/cost/BudgetManager.test.ts
// Phase 3.1: Unit tests for BudgetManager

import { describe, it, expect, vi, beforeEach } from "vitest";
import { BudgetManager } from "./BudgetManager";
import type { ICostTracker } from "./CostTracker";
import type { IPricingRegistry } from "./PricingRegistry";
import type { LLMUsage, BudgetConfig } from "./types";

describe("BudgetManager", () => {
  let mockCostTracker: ICostTracker;
  let mockPricingRegistry: IPricingRegistry;
  let budgetManager: BudgetManager;
  const defaultConfig: BudgetConfig = {
    maxCostPerRun: 1.0,
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

    it("should deny calls that exceed run budget", async () => {
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
      expect(result.reason).toContain("Run budget limit exceeded");
    });

    it("should use provided cost in usage if available", async () => {
      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        cost: 0.05,
      };

      const result = await budgetManager.checkBudget("run-1", usage);

      expect(result.allowed).toBe(true);
      expect(mockPricingRegistry.calculateCost).not.toHaveBeenCalled();
    });

    it("should skip warning when maxCostPerRun is zero (unlimited)", async () => {
      const manager = new BudgetManager(mockCostTracker, mockPricingRegistry, {
        maxCostPerRun: 0,
        maxCostPerSession: 5.0,
        warningThreshold: 0.8,
      });

      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      };

      const result = await manager.checkBudget("run-1", usage);

      expect(result.allowed).toBe(true);
      expect(result.remainingBudget).toBe(Infinity);
    });

    it("should throw when maxCostPerRun is negative", () => {
      expect(() => {
        new BudgetManager(mockCostTracker, mockPricingRegistry, {
          maxCostPerRun: -1,
          maxCostPerSession: 5.0,
        });
      }).toThrow("Invalid maxCostPerRun");
    });
  });

  describe("checkSessionBudget", () => {
    it("should allow calls within session budget", async () => {
      await budgetManager.startSession("session-1");

      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      };

      const result = await budgetManager.checkSessionBudget("session-1", usage);

      expect(result.allowed).toBe(true);
      expect(result.sessionRemainingBudget).toBe(5.0);
    });

    it("should deny calls that exceed session budget", async () => {
      const manager = new BudgetManager(mockCostTracker, mockPricingRegistry, {
        maxCostPerRun: 1.0,
        maxCostPerSession: 0.5,
        warningThreshold: 0.8,
      });
      await manager.startSession("session-test");

      vi.mocked(mockPricingRegistry.calculateCost).mockReturnValue({
        inputCost: 0.3,
        outputCost: 0.3,
        totalCost: 0.6,
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

      const result = await manager.checkSessionBudget("session-test", usage);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Session budget limit exceeded");
    });

    it("should skip session check when maxCostPerSession is zero (unlimited)", async () => {
      const manager = new BudgetManager(mockCostTracker, mockPricingRegistry, {
        maxCostPerRun: 1.0,
        maxCostPerSession: 0,
      });
      await manager.startSession("session-unlimited");

      const usage: LLMUsage = {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      };

      const result = await manager.checkSessionBudget(
        "session-unlimited",
        usage,
      );

      expect(result.allowed).toBe(true);
      expect(result.sessionRemainingBudget).toBe(Infinity);
    });
  });

  describe("session lifecycle", () => {
    it("should track session costs", async () => {
      await budgetManager.startSession("session-new");
      await budgetManager.recordSessionCost("session-new", 0.5);

      const remaining =
        await budgetManager.getRemainingSessionBudget("session-new");
      expect(remaining).toBe(4.5);

      await budgetManager.endSession("session-new");

      const remainingAfterEnd =
        await budgetManager.getRemainingSessionBudget("session-new");
      expect(remainingAfterEnd).toBe(5.0);
    });

    it("should detect when session is over budget", async () => {
      await budgetManager.startSession("session-over");
      await budgetManager.recordSessionCost("session-over", 5.0);

      const isOver = await budgetManager.isOverSessionBudget("session-over");
      expect(isOver).toBe(true);
    });
  });

  describe("getRemainingBudget", () => {
    it("should return Infinity when budget is unlimited", async () => {
      const manager = new BudgetManager(mockCostTracker, mockPricingRegistry, {
        maxCostPerRun: 0,
        maxCostPerSession: 5.0,
      });

      const remaining = await manager.getRemainingBudget("run-1");
      expect(remaining).toBe(Infinity);
    });
  });

  describe("configuration validation", () => {
    it("should reject invalid warningThreshold", () => {
      expect(() => {
        new BudgetManager(mockCostTracker, mockPricingRegistry, {
          warningThreshold: 1.5,
        });
      }).toThrow("Invalid warningThreshold");

      expect(() => {
        new BudgetManager(mockCostTracker, mockPricingRegistry, {
          warningThreshold: -0.1,
        });
      }).toThrow("Invalid warningThreshold");
    });

    it("should update config dynamically", () => {
      budgetManager.updateConfig({ maxCostPerRun: 2.0 });
      expect(budgetManager.getConfig().maxCostPerRun).toBe(2.0);
    });

    it("should reject invalid config in updateConfig", () => {
      expect(() => {
        budgetManager.updateConfig({ maxCostPerRun: -1 });
      }).toThrow("Invalid maxCostPerRun");
    });
  });
});
