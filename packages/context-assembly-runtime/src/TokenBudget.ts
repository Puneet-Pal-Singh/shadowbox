/**
 * TokenBudget - Track and manage token allocation
 *
 * Single responsibility: Manage token budget allocation
 * No side effects, deterministic allocation
 */
import type {
  TokenBudget as ITokenBudget,
  TokenUsage,
} from "@shadowbox/context-assembly";

export class TokenBudget implements ITokenBudget {
  readonly total: number;
  used: number;

  constructor(total: number) {
    this.total = total;
    this.used = 0;
  }

  get remaining(): number {
    return Math.max(0, this.total - this.used);
  }

  allocate(amount: number): boolean {
    if (amount <= 0) {
      return true;
    }

    if (this.used + amount > this.total) {
      return false;
    }

    this.used += amount;
    return true;
  }

  forceAllocate(amount: number): void {
    this.used += Math.max(0, amount);
  }

  getUsage(): TokenUsage {
    return {
      used: this.used,
      total: this.total,
      percentage: this.total > 0 ? (this.used / this.total) * 100 : 0,
    };
  }
}
