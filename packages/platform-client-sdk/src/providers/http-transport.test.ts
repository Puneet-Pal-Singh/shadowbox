import { describe, expect, it, vi } from "vitest";
import { createByokHttpTransport } from "./http-transport.js";
import { ProviderClientOperationError } from "./errors.js";

describe("createByokHttpTransport", () => {
  it("sends byok requests with run-id headers", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: vi.fn(async () => []),
    })) as unknown as typeof fetch;
    const transport = createByokHttpTransport({
      baseUrl: "http://localhost:8788/api/byok",
      getRunId: () => "run-123",
      fetchImpl,
    });

    await transport.discoverProviders();

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:8788/api/byok/providers",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Run-Id": "run-123",
        },
      }),
    );
  });

  it("fails fast when run id is missing", async () => {
    const transport = createByokHttpTransport({
      baseUrl: "http://localhost:8788/api/byok",
      getRunId: () => null,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    await expect(transport.discoverProviders()).rejects.toMatchObject({
      code: "MISSING_RUN_ID",
      statusCode: 400,
    });
  });

  it("maps response envelopes to operation errors", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 400,
      headers: new Headers({ "content-type": "application/json" }),
      json: vi.fn(async () => ({
        error: {
          code: "VALIDATION_ERROR",
          message: "provider id is invalid",
          retryable: false,
        },
      })),
    })) as unknown as typeof fetch;
    const transport = createByokHttpTransport({
      baseUrl: "http://localhost:8788/api/byok",
      getRunId: () => "run-123",
      fetchImpl,
    });

    await expect(transport.discoverProviders()).rejects.toBeInstanceOf(
      ProviderClientOperationError,
    );
  });

  it("forwards abort signals to fetch", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: vi.fn(async () => []),
    })) as unknown as typeof fetch;
    const transport = createByokHttpTransport({
      baseUrl: "http://localhost:8788/api/byok",
      getRunId: () => "run-123",
      fetchImpl,
    });
    const controller = new AbortController();

    await transport.discoverProviders({ signal: controller.signal });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:8788/api/byok/providers",
      expect.objectContaining({
        signal: controller.signal,
      }),
    );
  });

  it("returns INVALID_ERROR_RESPONSE when JSON error parsing fails", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 502,
      headers: new Headers({ "content-type": "application/json" }),
      clone: vi.fn(() => ({
        text: vi.fn(async () => "{\"error\":"),
      })),
      json: vi.fn(async () => {
        throw new Error("Unexpected end of JSON input");
      }),
    })) as unknown as typeof fetch;
    const transport = createByokHttpTransport({
      baseUrl: "http://localhost:8788/api/byok",
      getRunId: () => "run-123",
      fetchImpl,
    });

    await expect(transport.discoverProviders()).rejects.toMatchObject({
      code: "INVALID_ERROR_RESPONSE",
      message: expect.stringContaining("Malformed JSON error response"),
      statusCode: 502,
    });
  });

  it("does not allow overriding protected transport headers", async () => {
    let capturedRequestInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequestInit = init;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: vi.fn(async () => []),
      };
    });
    const fetchImpl = fetchMock as unknown as typeof fetch;
    const transport = createByokHttpTransport({
      baseUrl: "http://localhost:8788/api/byok",
      getRunId: () => "run-123",
      getHeaders: () => ({
        "X-Run-Id": "run-override",
        "x-run-id": "run-lowercase-override",
        "Content-Type": "text/plain",
        "content-type": "text/html",
        "X-Client-Id": "desktop",
      }),
      fetchImpl,
    });

    await transport.discoverProviders();

    const headers = capturedRequestInit?.headers as Record<string, string>;
    expect(headers["X-Run-Id"]).toBe("run-123");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Client-Id"]).toBe("desktop");
    expect(headers).not.toHaveProperty("x-run-id");
    expect(headers).not.toHaveProperty("content-type");
  });
});
