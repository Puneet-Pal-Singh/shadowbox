import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderApiClient } from "../ProviderApiClient";
import { SessionStateService } from "../SessionStateService";
import { _resetEndpointCache } from "../../lib/platform-endpoints";

describe("ProviderApiClient runId headers", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    _resetEndpointCache();
    vi.stubEnv("VITE_BRAIN_BASE_URL", "http://brain.test");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses runId from sessionStorage when available", async () => {
    sessionStorage.setItem("currentRunId", "run-from-session");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ providers: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    const fallbackSpy = vi
      .spyOn(SessionStateService, "loadActiveSessionRunId")
      .mockReturnValue("run-from-fallback");

    await ProviderApiClient.getStatus();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://brain.test/api/providers/status",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Run-Id": "run-from-session",
        }),
      }),
    );
    expect(fallbackSpy).not.toHaveBeenCalled();
  });

  it("falls back to SessionStateService when sessionStorage access fails", async () => {
    const storageError = new Error("SecurityError");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
      this: Storage,
    ) {
      if (this === sessionStorage) {
        throw storageError;
      }
      return null;
    });
    vi.spyOn(SessionStateService, "loadActiveSessionRunId").mockReturnValue(
      "run-from-fallback",
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ providers: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await ProviderApiClient.getStatus();

    expect(errorSpy).toHaveBeenCalledWith(
      "[provider/api] Failed to read run ID from sessionStorage",
      storageError,
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://brain.test/api/providers/status",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Run-Id": "run-from-fallback",
        }),
      }),
    );
  });

  it("logs warning when runId is unavailable and omits X-Run-Id header", async () => {
    vi.spyOn(SessionStateService, "loadActiveSessionRunId").mockReturnValue(null);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ providers: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await ProviderApiClient.getStatus();

    expect(warnSpy).toHaveBeenCalledWith(
      "[provider/api] No active runId found; X-Run-Id header omitted",
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://brain.test/api/providers/status",
      expect.objectContaining({
        headers: expect.not.objectContaining({
          "X-Run-Id": expect.any(String),
        }),
      }),
    );
  });
});
