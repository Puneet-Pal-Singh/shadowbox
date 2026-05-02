import { describe, expect, it } from "vitest";
import { RUN_TERMINAL_STATES } from "@repo/shared-types";
import {
  buildFinalSummaryFrame,
  isFinalSummaryContractEnabled,
  resolveNextStepFromSummaryText,
  resolveSummaryReason,
} from "./FinalSummaryBuilder.js";

describe("FinalSummaryBuilder", () => {
  it("builds a deterministic three-line summary frame", () => {
    const summary = buildFinalSummaryFrame({
      terminalState: RUN_TERMINAL_STATES.FAILED_TOOL,
      detail: "A shell step failed because the test script is missing.",
      nextStep: "Run `pnpm run` to list scripts, then retry with a valid script.",
    });

    expect(summary).toContain(
      "Outcome: I could not finish because a required tool step failed.",
    );
    expect(summary).toContain(
      "What happened: A shell step failed because the test script is missing.",
    );
    expect(summary).toContain(
      "What you can do next: Run `pnpm run` to list scripts, then retry with a valid script.",
    );
  });

  it("resolves feature flag from run metadata or env", () => {
    expect(isFinalSummaryContractEnabled(undefined, undefined)).toBe(false);
    expect(isFinalSummaryContractEnabled(undefined, "true")).toBe(true);
    expect(
      isFinalSummaryContractEnabled(
        { featureFlags: { finalSummaryContractV1: true } },
        undefined,
      ),
    ).toBe(true);
    expect(
      isFinalSummaryContractEnabled(
        { featureFlags: { final_summary_contract_v1: "yes" } },
        undefined,
      ),
    ).toBe(true);
  });

  it("extracts reason and next-step signals from a multiline summary", () => {
    const summaryText = [
      "A shell step failed because this workspace does not define a script named \"test\".",
      "Retry the failed step after listing available scripts.",
    ].join("\n");

    expect(resolveSummaryReason(summaryText)).toContain(
      "does not define a script named",
    );
    expect(resolveNextStepFromSummaryText(summaryText)).toBe(
      "Retry the failed step after listing available scripts.",
    );
  });

  it("extracts framed next-step lines from deterministic final summaries", () => {
    const summaryText = [
      "Outcome: I could not finish because a required tool step failed.",
      "What happened: A shell step failed because the test script is missing.",
      "What you can do next: Retry the failed step after listing available scripts.",
    ].join("\n");

    expect(resolveNextStepFromSummaryText(summaryText)).toBe(
      "Retry the failed step after listing available scripts.",
    );
  });
});
