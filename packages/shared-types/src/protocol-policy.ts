import { z } from "zod";

export const PROTOCOL_POLICY_VERSION = "v1" as const;
export const PROTOCOL_POLICY_DOCUMENT_PATH =
  "packages/shared-types/PROTOCOL_VERSIONING_POLICY.md" as const;
export const PROTOCOL_CURRENT_VERSION = 1 as const;
export const PROTOCOL_MIN_COMPATIBLE_VERSION = 1 as const;
export const PROTOCOL_DEPRECATION_WINDOW_DAYS = 90 as const;

export const PROTOCOL_CHANGE_CATEGORY = {
  NON_BREAKING: "non_breaking",
  BREAKING: "breaking",
} as const;

export type ProtocolChangeCategory =
  (typeof PROTOCOL_CHANGE_CATEGORY)[keyof typeof PROTOCOL_CHANGE_CATEGORY];

export const ProtocolChangeAssessmentSchema = z.object({
  previousVersion: z.number().int().min(1),
  nextVersion: z.number().int().min(1),
  changeCategory: z.enum([
    PROTOCOL_CHANGE_CATEGORY.NON_BREAKING,
    PROTOCOL_CHANGE_CATEGORY.BREAKING,
  ]),
  policyReference: z.string().min(1),
});

export type ProtocolChangeAssessment = z.infer<
  typeof ProtocolChangeAssessmentSchema
>;

export interface ProtocolCompatibilityDecision {
  compatibleWithCurrent: boolean;
  requiresUpgrade: boolean;
  deprecationWindowDays: number;
}

export function isProtocolVersionSupported(version: number): boolean {
  return (
    Number.isInteger(version) &&
    version >= PROTOCOL_MIN_COMPATIBLE_VERSION &&
    version <= PROTOCOL_CURRENT_VERSION
  );
}

export function validateProtocolPolicyReference(reference: string): boolean {
  return reference.includes(`${PROTOCOL_POLICY_DOCUMENT_PATH}#`);
}

export function evaluateProtocolChange(
  input: ProtocolChangeAssessment,
): ProtocolCompatibilityDecision {
  const assessment = ProtocolChangeAssessmentSchema.parse(input);
  assertVersionDirection(assessment.previousVersion, assessment.nextVersion);
  assertCategoryRules(assessment);

  return {
    compatibleWithCurrent: assessment.nextVersion <= PROTOCOL_CURRENT_VERSION,
    requiresUpgrade: assessment.nextVersion > assessment.previousVersion,
    deprecationWindowDays:
      assessment.changeCategory === PROTOCOL_CHANGE_CATEGORY.BREAKING
        ? PROTOCOL_DEPRECATION_WINDOW_DAYS
        : 0,
  };
}

function assertVersionDirection(previous: number, next: number): void {
  if (next < previous) {
    throw new Error(
      `[protocol/policy] nextVersion (${next}) cannot be lower than previousVersion (${previous})`,
    );
  }
}

function assertCategoryRules(assessment: ProtocolChangeAssessment): void {
  if (assessment.changeCategory === PROTOCOL_CHANGE_CATEGORY.NON_BREAKING) {
    assertNonBreakingRules(assessment.previousVersion, assessment.nextVersion);
    return;
  }
  assertBreakingRules(assessment);
}

function assertNonBreakingRules(previous: number, next: number): void {
  if (next !== previous) {
    throw new Error(
      "[protocol/policy] non_breaking changes must not bump protocol version",
    );
  }
}

function assertBreakingRules(assessment: ProtocolChangeAssessment): void {
  if (assessment.nextVersion !== assessment.previousVersion + 1) {
    throw new Error(
      "[protocol/policy] breaking changes must increment protocol version by exactly 1",
    );
  }
  if (!validateProtocolPolicyReference(assessment.policyReference)) {
    throw new Error(
      "[protocol/policy] breaking changes must reference the protocol v1 policy document anchor",
    );
  }
}
