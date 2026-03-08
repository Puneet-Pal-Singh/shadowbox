import { describe, expect, it } from "vitest";
import { Run } from "../run/index.js";
import {
  MissingManifestError,
  recordPhaseSelectionSnapshot,
} from "./RunMetadataPolicy.js";

describe("RunMetadataPolicy", () => {
  it("throws MissingManifestError when phase snapshot is recorded without manifest", () => {
    const run = new Run(
      "run-no-manifest",
      "session-1",
      "CREATED",
      "coding",
      {
        agentType: "coding",
        prompt: "test",
        sessionId: "session-1",
      },
      undefined,
      { prompt: "test" },
    );

    expect(() =>
      recordPhaseSelectionSnapshot(run, "planning"),
    ).toThrow(MissingManifestError);
  });

  it("records a cloned phase snapshot when manifest exists", () => {
    const run = new Run(
      "run-with-manifest",
      "session-1",
      "CREATED",
      "coding",
      {
        agentType: "coding",
        prompt: "test",
        sessionId: "session-1",
      },
      undefined,
      {
        prompt: "test",
        manifest: {
          mode: "agentic",
          providerId: "openai",
          modelId: "gpt-4o",
          harness: "cloudflare-sandbox",
          orchestratorBackend: "execution-engine-v1",
          executionBackend: "cloudflare_sandbox",
          harnessMode: "platform_owned",
          authMode: "api_key",
        },
      },
    );

    recordPhaseSelectionSnapshot(run, "planning");

    expect(run.metadata.phaseSelectionSnapshots?.planning).toBeDefined();
    expect(run.metadata.phaseSelectionSnapshots?.planning).toEqual(
      run.metadata.manifest,
    );
    expect(run.metadata.phaseSelectionSnapshots?.planning).not.toBe(
      run.metadata.manifest,
    );
  });
});
