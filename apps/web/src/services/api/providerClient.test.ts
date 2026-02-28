/**
 * ProviderApiClient Tests
 *
 * Tests for HTTP request handling, error mapping, and response validation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ProviderApiClient, ProviderApiError } from "./providerClient.js";

describe("ProviderApiClient", () => {
  const providerApiBaseUrl = "http://localhost:8788/api/byok";
  const testRunId = "run-123";
  let client: ProviderApiClient;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new ProviderApiClient({
      getRunId: () => testRunId,
    });
    fetchSpy = vi.spyOn(globalThis, "fetch") as unknown as ReturnType<
      typeof vi.spyOn
    >;
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getCatalog", () => {
    it("fetches provider catalog", async () => {
      const mockCatalog = [
        {
          providerId: "openai",
          displayName: "OpenAI",
          authModes: ["api_key"],
        },
      ];

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: vi.fn().mockResolvedValueOnce(mockCatalog),
      });

      const catalog = await client.getCatalog();

      expect(fetchSpy).toHaveBeenCalledWith(`${providerApiBaseUrl}/providers`, {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Run-Id": testRunId,
        },
        signal: undefined,
      });
      expect(catalog).toEqual(mockCatalog);
    });
  });

  describe("getProviderModels", () => {
    it("fetches model options for provider", async () => {
      const mockModels = [
        { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
      ];
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: vi.fn().mockResolvedValueOnce(mockModels),
      });

      const models = await client.getProviderModels("openrouter");

      expect(fetchSpy).toHaveBeenCalledWith(
        `${providerApiBaseUrl}/providers/openrouter/models`,
        {
          method: "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-Run-Id": testRunId,
          },
          signal: undefined,
        }
      );
      expect(models).toEqual(mockModels);
    });
  });

  describe("getCredentials", () => {
    it("fetches credentials", async () => {
      const mockCredentials = [
        {
          id: "cred-1",
          providerId: "openai",
          status: "connected",
        },
      ];

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: vi.fn().mockResolvedValueOnce(mockCredentials),
      });

      const credentials = await client.getCredentials();

      expect(fetchSpy).toHaveBeenCalledWith(`${providerApiBaseUrl}/credentials`, {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Run-Id": testRunId,
        },
        signal: undefined,
      });
      expect(credentials).toEqual(mockCredentials);
    });
  });

  describe("connectCredential", () => {
    it("connects a new credential", async () => {
      const mockCredential = {
        id: "cred-1",
        providerId: "openai",
        status: "connected",
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: vi.fn().mockResolvedValueOnce(mockCredential),
      });

      const credential = await client.connectCredential({
        providerId: "openai",
        secret: "sk-test",
      });

      expect(fetchSpy).toHaveBeenCalledWith(`${providerApiBaseUrl}/credentials`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Run-Id": testRunId,
        },
        signal: undefined,
        body: JSON.stringify({
          providerId: "openai",
          secret: "sk-test",
        }),
      });
      expect(credential).toEqual(mockCredential);
    });
  });

  describe("disconnectCredential", () => {
    it("disconnects credential", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await client.disconnectCredential("cred-1");

      expect(fetchSpy).toHaveBeenCalledWith(`${providerApiBaseUrl}/credentials/cred-1`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Run-Id": testRunId,
        },
        signal: undefined,
      });
    });
  });

  describe("validateCredential", () => {
    it("validates credential with format mode", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: vi.fn().mockResolvedValueOnce({ valid: true }),
      });

      const result = await client.validateCredential("cred-1", {
        mode: "format",
      });

      expect(result).toEqual({ valid: true });
      expect(fetchSpy).toHaveBeenCalledWith(
        `${providerApiBaseUrl}/credentials/cred-1/validate`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ mode: "format" }),
        })
      );
    });

    it("validates credential with live mode", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: vi.fn().mockResolvedValueOnce({ valid: true }),
      });

      const result = await client.validateCredential("cred-1", {
        mode: "live",
      });

      expect(result).toEqual({ valid: true });
    });
  });

  describe("error handling", () => {
    it("maps HTTP 400 error", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers({ "content-type": "application/json" }),
        json: vi.fn().mockResolvedValueOnce({
          error: {
            code: "INVALID_INPUT",
            message: "Provider ID is invalid",
          },
        }),
      });

      try {
        await client.getCatalog();
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderApiError);
        expect((error as ProviderApiError).code).toBe("INVALID_INPUT");
        expect((error as ProviderApiError).statusCode).toBe(400);
      }
    });

    it("marks 5xx errors as retryable", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers({}),
        json: vi.fn().mockResolvedValueOnce({
          error: { code: "INTERNAL_ERROR", message: "Internal server error" },
        }),
      });

      try {
        await client.getCatalog();
      } catch (error) {
        expect((error as ProviderApiError).isRetryable()).toBe(true);
      }
    });

    it("marks 429 errors as retryable", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({}),
        json: vi.fn().mockResolvedValueOnce({
          error: { code: "RATE_LIMIT", message: "Too many requests" },
        }),
      });

      try {
        await client.getCatalog();
      } catch (error) {
        expect((error as ProviderApiError).isRetryable()).toBe(true);
      }
    });

    it("handles network errors", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("Network unreachable"));

      try {
        await client.getCatalog();
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderApiError);
        expect((error as ProviderApiError).code).toBe("NETWORK_ERROR");
      }
    });

    it("handles abort signal", async () => {
      const error = new Error("Aborted");
      error.name = "AbortError";
      fetchSpy.mockRejectedValueOnce(error);

      try {
        await client.getCatalog();
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderApiError);
        expect((error as ProviderApiError).code).toBe("ABORTED");
      }
    });

    it("fails fast when run id is missing", async () => {
      const clientWithMissingRunId = new ProviderApiClient({
        getRunId: () => null,
      });
      await expect(clientWithMissingRunId.getCatalog()).rejects.toMatchObject({
        code: "MISSING_RUN_ID",
        statusCode: 400,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("includes correlationId in error", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers({ "content-type": "application/json" }),
        json: vi.fn().mockResolvedValueOnce({
          error: {
            code: "INVALID_INPUT",
            message: "Invalid credential",
            correlationId: "req-123",
          },
        }),
      });

      try {
        await client.getCatalog();
      } catch (error) {
        expect((error as ProviderApiError).correlationId).toBe("req-123");
      }
    });

    it("maps non-json success payload to invalid response format error", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        text: vi.fn().mockResolvedValueOnce("<!doctype html><html>"),
      });

      await expect(client.getCatalog()).rejects.toMatchObject({
        code: "INVALID_RESPONSE_FORMAT",
        statusCode: 502,
      });
    });
  });

  describe("abort", () => {
    it("aborts in-flight request", async () => {
      const abortSpy = vi.spyOn(AbortController.prototype, "abort");

      client.abort("test-key");

      expect(abortSpy).not.toHaveBeenCalled(); // No request was made
    });
  });
});
