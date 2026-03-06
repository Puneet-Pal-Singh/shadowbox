import { describe, expect, it, vi } from "vitest";
import { createByokCloudTransport } from "./cloud-transport.js";

describe("createByokCloudTransport", () => {
  it("uses omit credentials and injects bearer token", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: vi.fn(async () => []),
    })) as unknown as typeof fetch;
    const transport = createByokCloudTransport({
      baseUrl: "http://localhost:8788/api/byok",
      getRunId: () => "run-123",
      getAccessToken: () => "desktop-token",
      getHeaders: () => ({ "X-Client-Id": "desktop" }),
      fetchImpl,
    });

    await transport.discoverProviders();

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:8788/api/byok/providers",
      expect.objectContaining({
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
          "X-Run-Id": "run-123",
          "X-Client-Id": "desktop",
          Authorization: "Bearer desktop-token",
        },
      }),
    );
  });

  it("keeps explicit Authorization header when provided", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: vi.fn(async () => []),
    })) as unknown as typeof fetch;
    const transport = createByokCloudTransport({
      baseUrl: "http://localhost:8788/api/byok",
      getRunId: () => "run-123",
      getAccessToken: () => "token-should-not-override",
      getHeaders: () => ({ Authorization: "Bearer explicit-token" }),
      fetchImpl,
    });

    await transport.discoverProviders();

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:8788/api/byok/providers",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer explicit-token",
        }),
      }),
    );
  });
});
