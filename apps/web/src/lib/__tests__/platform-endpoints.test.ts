/**
 * Platform Endpoints Tests - Verify endpoint construction and environment handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getBrainHttpBase,
  getMuscleHttpBase,
  getMuscleWsBase,
  chatStreamPath,
  chatHistoryPath,
  gitStatusPath,
  gitStagePath,
  artifactPath,
  terminalConnectPath,
  terminalCommandPath,
  validateEndpointConfig,
} from "../platform-endpoints.js";

// Store original env
const originalEnv = { ...import.meta.env };

// Helper to safely set env vars
const setEnv = (key: string, value: string): void => {
  (import.meta.env as unknown as Record<string, string>)[key] = value;
};

// Helper to safely delete env vars
const deleteEnv = (key: string): void => {
  delete (import.meta.env as unknown as Record<string, unknown>)[key];
};

describe("Platform Endpoints", () => {
  beforeEach(() => {
    // Clear env vars before each test
    deleteEnv("VITE_BRAIN_BASE_URL");
    deleteEnv("VITE_MUSCLE_BASE_URL");
    deleteEnv("VITE_MUSCLE_WS_URL");
  });

  afterEach(() => {
    // Restore original env
    Object.assign(import.meta.env, originalEnv);
    vi.clearAllMocks();
  });

  describe("getBrainHttpBase", () => {
    it("should use VITE_BRAIN_BASE_URL when set", () => {
      setEnv("VITE_BRAIN_BASE_URL", "https://brain.example.com");
      expect(getBrainHttpBase()).toBe("https://brain.example.com");
    });

    it("should use default when env var not set", () => {
      const base = getBrainHttpBase();
      expect(base).toBe("http://localhost:8788");
    });

    it("should log warning when using default", () => {
      const warnSpy = vi.spyOn(console, "warn");
      getBrainHttpBase();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("VITE_BRAIN_BASE_URL not set"),
        expect.stringContaining("http://localhost:8788"),
      );
    });
  });

  describe("getMuscleHttpBase", () => {
    it("should use VITE_MUSCLE_BASE_URL when set", () => {
      setEnv("VITE_MUSCLE_BASE_URL", "https://muscle.example.com");
      expect(getMuscleHttpBase()).toBe("https://muscle.example.com");
    });

    it("should use default when env var not set", () => {
      const base = getMuscleHttpBase();
      expect(base).toBe("http://localhost:8787");
    });
  });

  describe("getMuscleWsBase", () => {
    it("should use VITE_MUSCLE_WS_URL when set", () => {
      setEnv("VITE_MUSCLE_WS_URL", "wss://ws.example.com");
      expect(getMuscleWsBase()).toBe("wss://ws.example.com");
    });

    it("should use default when env var not set", () => {
      const base = getMuscleWsBase();
      expect(base).toBe("ws://localhost:8787");
    });
  });

  describe("Path builders", () => {
    beforeEach(() => {
      setEnv("VITE_BRAIN_BASE_URL", "https://brain.local");
      setEnv("VITE_MUSCLE_BASE_URL", "https://muscle.local");
      setEnv("VITE_MUSCLE_WS_URL", "wss://ws.local");
    });

    it("should build chat stream path from Brain", () => {
      expect(chatStreamPath()).toBe("https://brain.local/chat");
    });

    it("should build chat history path with runId", () => {
      expect(chatHistoryPath("run-123")).toBe(
        "https://muscle.local/api/chat/history/run-123",
      );
    });

    it("should encode runId in chat history path", () => {
      expect(chatHistoryPath("run/with/slashes")).toBe(
        "https://muscle.local/api/chat/history/run%2Fwith%2Fslashes",
      );
    });

    it("should build git status path with runId", () => {
      expect(gitStatusPath("run-456")).toBe(
        "https://muscle.local/api/git/status/run-456",
      );
    });

    it("should build git stage path with runId", () => {
      expect(gitStagePath("run-789")).toBe(
        "https://muscle.local/api/git/stage/run-789",
      );
    });

    it("should build artifact path with runId and key", () => {
      expect(artifactPath("run-abc", "artifact-key")).toBe(
        "https://muscle.local/api/artifacts/run-abc/artifact-key",
      );
    });

    it("should encode both runId and key in artifact path", () => {
      expect(artifactPath("run/123", "key/456")).toBe(
        "https://muscle.local/api/artifacts/run%2F123/key%2F456",
      );
    });

    it("should build terminal connect path with sessionId", () => {
      expect(terminalConnectPath("session-123")).toBe(
        "wss://ws.local/connect?session=session-123",
      );
    });

    it("should encode sessionId in terminal connect path", () => {
      expect(terminalConnectPath("session with spaces")).toBe(
        "wss://ws.local/connect?session=session%20with%20spaces",
      );
    });

    it("should build terminal command path with sessionId", () => {
      expect(terminalCommandPath("session-456")).toBe(
        "https://muscle.local/?session=session-456",
      );
    });
  });

  describe("validateEndpointConfig", () => {
    it("should warn about missing vars in dev", () => {
      (import.meta.env as unknown as Record<string, string>).MODE = "development";
      const warnSpy = vi.spyOn(console, "warn");

      validateEndpointConfig();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Using default endpoints"),
        expect.any(Array),
      );
    });

    it("should not error when all vars present in production", () => {
      (import.meta.env as unknown as Record<string, string>).MODE = "production";
      setEnv("VITE_BRAIN_BASE_URL", "https://brain.prod");
      setEnv("VITE_MUSCLE_BASE_URL", "https://muscle.prod");
      setEnv("VITE_MUSCLE_WS_URL", "wss://ws.prod");

      const errorSpy = vi.spyOn(console, "error");

      validateEndpointConfig();

      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
