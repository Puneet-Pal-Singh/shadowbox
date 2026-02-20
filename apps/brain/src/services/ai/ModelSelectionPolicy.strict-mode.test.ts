import { afterEach, describe, expect, it } from "vitest";
import {
  getRuntimeProviderFromAdapter,
  mapProviderIdToRuntimeProvider,
  resolveModelSelection,
} from "./ModelSelectionPolicy";
import { setCompatModeOverride } from "../../config/runtime-compat";

describe("ModelSelectionPolicy strict mode", () => {
  const defaultProvider = "litellm";
  const defaultModel = "llama-3.3-70b-versatile";

  afterEach(() => {
    setCompatModeOverride(false);
  });

  it("throws INVALID_PROVIDER_SELECTION for unknown provider", () => {
    setCompatModeOverride(false);

    expectDomainError(() =>
      resolveModelSelection(
        "invalid-provider",
        "gpt-4o",
        defaultProvider,
        defaultModel,
        mapProviderIdToRuntimeProvider,
        getRuntimeProviderFromAdapter,
      ),
      "INVALID_PROVIDER_SELECTION",
    );
  });

  it("throws MODEL_NOT_ALLOWED for provider/model mismatch", () => {
    setCompatModeOverride(false);

    expectDomainError(() =>
      resolveModelSelection(
        "openai",
        "llama-3.3-70b-versatile",
        defaultProvider,
        defaultModel,
        mapProviderIdToRuntimeProvider,
        getRuntimeProviderFromAdapter,
      ),
      "MODEL_NOT_ALLOWED",
    );
  });

  it("throws PARTIAL_OVERRIDE for incomplete provider/model override", () => {
    setCompatModeOverride(false);

    expectDomainError(() =>
      resolveModelSelection(
        "openai",
        undefined,
        defaultProvider,
        defaultModel,
        mapProviderIdToRuntimeProvider,
        getRuntimeProviderFromAdapter,
      ),
      "PARTIAL_OVERRIDE",
    );
  });

  it("allows valid provider/model override in strict mode", () => {
    setCompatModeOverride(false);

    const selection = resolveModelSelection(
      "openai",
      "gpt-4o",
      defaultProvider,
      defaultModel,
      mapProviderIdToRuntimeProvider,
      getRuntimeProviderFromAdapter,
    );

    expect(selection.provider).toBe("openai");
    expect(selection.model).toBe("gpt-4o");
    expect(selection.fallback).toBe(false);
  });
});

function expectDomainError(
  run: () => unknown,
  expectedCode: string,
): void {
  try {
    run();
    throw new Error(`Expected error with code ${expectedCode}`);
  } catch (error) {
    expect(error).toMatchObject({ code: expectedCode });
  }
}
