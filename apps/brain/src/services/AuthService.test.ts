import { describe, expect, it } from "vitest";
import type { Env } from "../types/ai";
import { getAuthenticatedUserSession } from "./AuthService";

describe("AuthService", () => {
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
