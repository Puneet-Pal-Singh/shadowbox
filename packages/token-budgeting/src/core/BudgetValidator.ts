/**
 * BudgetValidator - Safety and constraint validation
 *
 * Single responsibility: Validate inputs and enforce hard safety rules
 * No side effects, all validations are pure checks
 */
import type {
  ModelConfig,
  ContextComponent,
  BudgetedContextPlan,
  ContextWithTokens,
} from "../types.js";
import { BucketKind as BucketKindEnum, TruncationPolicy } from "../types.js";

/**
 * Validate inputs and enforce safety constraints
 */
export class BudgetValidator {
  /**
   * Validate model config exists and is sane
   */
  static validateModel(model: ModelConfig): void {
    if (!model) {
      throw new Error("Model config required");
    }
    if (!model.id || typeof model.id !== "string") {
      throw new Error("Model must have valid id");
    }
    if (typeof model.maxTokens !== "number" || model.maxTokens <= 0) {
      throw new Error("Model maxTokens must be positive");
    }
  }

  /**
   * Validate components are well-formed
   */
  static validateComponents(components: ContextComponent[]): void {
    if (!Array.isArray(components)) {
      throw new Error("Components must be an array");
    }

    const validBuckets = Object.values(BucketKindEnum);

    for (let i = 0; i < components.length; i++) {
      const comp = components[i];
      if (!comp) {
        throw new Error(`Component ${i} is null or undefined`);
      }
      if (!validBuckets.includes(comp.bucket)) {
        throw new Error(`Component ${i} has invalid bucket: ${comp.bucket}`);
      }
      if (typeof comp.content !== "string") {
        throw new Error(`Component ${i} content must be string`);
      }
    }
  }

  /**
   * Check if SYSTEM + USER alone exceed budget (hard failure case)
   * @returns Discriminated union - either valid or invalid with deficit
   */
  static checkRequiredBucketsWithinLimit(
    system: ContextWithTokens,
    user: ContextWithTokens,
    availableTokens: number,
  ): { valid: true } | { valid: false; deficit: number } {
    const requiredTokens = system.estimatedTokens + user.estimatedTokens;

    if (requiredTokens > availableTokens) {
      return {
        valid: false,
        deficit: requiredTokens - availableTokens,
      };
    }

    return { valid: true };
  }

  /**
   * Validate final budget plan meets all safety invariants
   * @throws Error if plan violates invariants
   */
  static validatePlan(plan: BudgetedContextPlan): void {
    if (!plan) {
      throw new Error("Plan required");
    }

    // Check safety.withinLimit
    if (!plan.safety.withinLimit && plan.errors.length === 0) {
      throw new Error(
        "Plan is not within limit but has no errors recorded",
      );
    }

    // If withinLimit is true, verify the math
    if (plan.safety.withinLimit) {
      if (plan.totalAllocatedTokens > plan.availableForInput) {
        throw new Error(
          `Plan exceeds available tokens: ${plan.totalAllocatedTokens} > ${plan.availableForInput}`,
        );
      }
      if (plan.safety.remaining < 0) {
        throw new Error(`Plan has negative remaining tokens: ${plan.safety.remaining}`);
      }
    }

    // Check decisions match components
    const decisionsByKind = new Map(plan.decisions.map((d) => [d.kind, d]));
    for (const comp of plan.components) {
      const decision = decisionsByKind.get(comp.bucket);
      if (!decision) {
        throw new Error(`No decision for bucket: ${comp.bucket}`);
      }
      if (decision.included && !comp.content) {
        throw new Error(`Included component but no content for: ${comp.bucket}`);
      }
    }

    // Check REJECT buckets (SYSTEM, USER) have decisions
    const systemDec = decisionsByKind.get(BucketKindEnum.SYSTEM);
    const userDec = decisionsByKind.get(BucketKindEnum.USER);

    if (!systemDec) {
      throw new Error("No SYSTEM bucket decision");
    }
    if (!userDec) {
      throw new Error("No USER bucket decision");
    }

    // REJECT policy buckets must be included or plan is invalid
    if (!systemDec.included) {
      throw new Error("SYSTEM bucket not included but has REJECT policy");
    }
    if (!userDec.included) {
      throw new Error("USER bucket not included but has REJECT policy");
    }
  }

  /**
   * Validate truncation was done safely
   */
  static validateTruncation(
    original: string,
    truncated: string,
    policy: TruncationPolicy,
  ): void {
    if (policy !== TruncationPolicy.TRUNCATE) {
      return;
    }

    if (!truncated || truncated.length >= original.length) {
      throw new Error("Truncation produced no reduction");
    }
  }
}
