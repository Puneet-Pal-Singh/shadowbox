import { describe, expect, it } from "vitest";
import {
  PROTOCOL_CHANGE_CATEGORY,
  PROTOCOL_CURRENT_VERSION,
  PROTOCOL_DEPRECATION_WINDOW_DAYS,
  PROTOCOL_MIN_COMPATIBLE_VERSION,
  PROTOCOL_POLICY_DOCUMENT_PATH,
  PROTOCOL_POLICY_VERSION,
  evaluateProtocolChange,
  isProtocolVersionSupported,
  validateProtocolPolicyReference,
} from "./protocol-policy.js";
import { CHAT_RESPONSE_PROTOCOL_VERSION } from "./chat-response-contract.js";
import { EXTERNAL_CONTRACT_FREEZE_VERSION } from "./external-contracts.js";

describe("protocol v1 versioning policy", () => {
  it("pins protocol policy and compatibility window", () => {
    expect(PROTOCOL_POLICY_VERSION).toBe("v1");
    expect(PROTOCOL_CURRENT_VERSION).toBe(1);
    expect(PROTOCOL_MIN_COMPATIBLE_VERSION).toBe(1);
    expect(PROTOCOL_DEPRECATION_WINDOW_DAYS).toBe(90);
  });

  it("keeps shared protocol versions aligned with policy baseline", () => {
    expect(CHAT_RESPONSE_PROTOCOL_VERSION).toBe(PROTOCOL_CURRENT_VERSION);
    expect(EXTERNAL_CONTRACT_FREEZE_VERSION).toBe(PROTOCOL_CURRENT_VERSION);
  });

  it("accepts non-breaking changes without version bump", () => {
    const decision = evaluateProtocolChange({
      previousVersion: 1,
      nextVersion: 1,
      changeCategory: PROTOCOL_CHANGE_CATEGORY.NON_BREAKING,
      policyReference: `${PROTOCOL_POLICY_DOCUMENT_PATH}#change-categories`,
    });

    expect(decision).toEqual({
      compatibleWithCurrent: true,
      requiresUpgrade: false,
      deprecationWindowDays: 0,
    });
  });

  it("enforces explicit breaking-change process", () => {
    const decision = evaluateProtocolChange({
      previousVersion: 1,
      nextVersion: 2,
      changeCategory: PROTOCOL_CHANGE_CATEGORY.BREAKING,
      policyReference: `${PROTOCOL_POLICY_DOCUMENT_PATH}#breaking-change-process`,
    });

    expect(decision).toEqual({
      compatibleWithCurrent: false,
      requiresUpgrade: true,
      deprecationWindowDays: 90,
    });
  });

  it("rejects invalid breaking-change references", () => {
    expect(() =>
      evaluateProtocolChange({
        previousVersion: 1,
        nextVersion: 2,
        changeCategory: PROTOCOL_CHANGE_CATEGORY.BREAKING,
        policyReference: "docs/random.md",
      }),
    ).toThrow("must reference the protocol v1 policy document anchor");
  });

  it("rejects non-breaking version bumps", () => {
    expect(() =>
      evaluateProtocolChange({
        previousVersion: 1,
        nextVersion: 2,
        changeCategory: PROTOCOL_CHANGE_CATEGORY.NON_BREAKING,
        policyReference: `${PROTOCOL_POLICY_DOCUMENT_PATH}#change-categories`,
      }),
    ).toThrow("non_breaking changes must not bump protocol version");
  });

  it("validates supported protocol versions", () => {
    expect(isProtocolVersionSupported(1)).toBe(true);
    expect(isProtocolVersionSupported(0)).toBe(false);
    expect(isProtocolVersionSupported(2)).toBe(false);
  });

  it("validates policy references by document anchor", () => {
    expect(
      validateProtocolPolicyReference(
        `${PROTOCOL_POLICY_DOCUMENT_PATH}#compatibility-window`,
      ),
    ).toBe(true);
    expect(validateProtocolPolicyReference("README.md")).toBe(false);
  });
});
