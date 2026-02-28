import { describe, expect, it } from "vitest";
import {
  SDK_READINESS_PACK_V1,
  SdkReadinessPackSchema,
  collectSdkBlockers,
  getSdkReadinessPack,
  validateSdkReadinessPack,
} from "./sdk-readiness.js";

describe("sdk readiness pack", () => {
  it("validates pack schema and expected surface coverage", () => {
    const parsed = SdkReadinessPackSchema.parse(SDK_READINESS_PACK_V1);
    const surfaces = parsed.surfaces.map((surface) => surface.surface);

    expect(surfaces).toEqual(["web", "desktop", "cli"]);
    expect(validateSdkReadinessPack(parsed)).toBe(true);
  });

  it("exposes required checklist items across all surfaces", () => {
    const pack = getSdkReadinessPack();

    for (const surface of pack.surfaces) {
      const ids = surface.checklist.map((item) => item.id);
      expect(ids).toContain(`${surface.surface}-contract-parse`);
      expect(ids).toContain(`${surface.surface}-compat-policy`);
      expect(ids).toContain(`${surface.surface}-vault-surface`);
    }
  });

  it("contains explicit blockers and dependencies for handoff", () => {
    const pack = getSdkReadinessPack();

    for (const surface of pack.surfaces) {
      expect(surface.blockers.length).toBeGreaterThan(0);
      expect(surface.requiredDependencies.length).toBeGreaterThan(0);
      expect(surface.migrationNotes.length).toBeGreaterThan(0);
    }
  });

  it("includes protocol policy references and shared-contract examples", () => {
    const pack = getSdkReadinessPack();

    expect(pack.protocolPolicyReference).toContain(
      "PROTOCOL_VERSIONING_POLICY.md#compatibility-window",
    );
    for (const surface of pack.surfaces) {
      expect(surface.referenceExamples.connectProvider).toContain(
        "EXTERNAL_PROVIDER_CONTRACT",
      );
      expect(surface.referenceExamples.streamEvents).toContain(
        "parseChatResponseEventContract",
      );
      expect(surface.referenceExamples.compatibilityPolicy).toContain(
        "PROTOCOL_VERSIONING_POLICY.md#change-categories",
      );
    }
  });

  it("aggregates blockers by surface for integration handoff", () => {
    const blockers = collectSdkBlockers(getSdkReadinessPack());

    expect(blockers.web.length).toBeGreaterThan(0);
    expect(blockers.desktop.length).toBeGreaterThan(0);
    expect(blockers.cli.length).toBeGreaterThan(0);
  });
});
