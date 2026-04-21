import { describe, expect, it } from "vitest";
import type { Env } from "../types/ai";
import {
  getAuthenticatedUserSession,
  SessionStoreUnavailableError,
} from "./AuthService";

describe("AuthService", () => {
  it("returns the authenticated session for valid encrypted token payloads", async () => {
    const secret = "test-secret";
    const token = await createSignedSessionToken("user-1", secret);
    const request = new Request("https://shadowbox.test", {
      headers: {
        Cookie: `shadowbox_session=${token}`,
      },
    });

    const result = await getAuthenticatedUserSession(
      request,
      {
        SESSION_SECRET: secret,
        SESSIONS: {
          get: async () =>
            JSON.stringify({
              userId: "user-1",
              login: "shadowbox-user",
              avatar: "https://example.com/avatar.png",
              email: "user@example.com",
              name: "Shadowbox User",
              encryptedToken: {
                ciphertext: "ciphertext",
                iv: "iv",
                tag: "tag",
              },
              createdAt: Date.now(),
            }),
        },
      } as unknown as Env,
    );

    expect(result).not.toBeNull();
    expect(result?.userId).toBe("user-1");
    expect(result?.session.login).toBe("shadowbox-user");
  });

  it("returns null for malformed persisted user sessions", async () => {
    const secret = "test-secret";
    const token = await createSignedSessionToken("user-1", secret);
    const request = new Request("https://shadowbox.test", {
      headers: {
        Cookie: `shadowbox_session=${token}`,
      },
    });

    const result = await getAuthenticatedUserSession(
      request,
      {
        SESSION_SECRET: secret,
        SESSIONS: {
          get: async () => "{bad json",
        },
      } as unknown as Env,
    );

    expect(result).toBeNull();
  });

  it("throws a typed error when session KV is unavailable", async () => {
    const secret = "test-secret";
    const token = await createSignedSessionToken("user-1", secret);
    const request = new Request("https://shadowbox.test", {
      headers: {
        Cookie: `shadowbox_session=${token}`,
      },
    });

    const resultPromise = getAuthenticatedUserSession(
      request,
      {
        SESSION_SECRET: secret,
        SESSIONS: {
          get: async () => {
            throw new Error("KV GET failed: 400 Bad Request");
          },
        },
      } as unknown as Env,
    );

    await expect(resultPromise).rejects.toBeInstanceOf(
      SessionStoreUnavailableError,
    );
  });
});

async function createSignedSessionToken(
  userId: string,
  secret: string,
): Promise<string> {
  const timestamp = Date.now().toString();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${userId}:${timestamp}`),
  );
  const signatureBytes = Array.from(new Uint8Array(signature))
    .map((value) => String.fromCharCode(value))
    .join("");
  return `${userId}:${timestamp}:${btoa(signatureBytes)}`;
}
