import { describe, expect, it } from "vitest";
import type { Env } from "../../types/ai";
import {
  CommitIdentityError,
  readCommitIdentityStateForUser,
  resolveCommitIdentityForCommit,
  resolveCommitIdentityForStoredUserSession,
} from "./GitCommitIdentityService";

describe("GitCommitIdentityService", () => {
  it("returns null when the stored user session is malformed", async () => {
    const result = await resolveCommitIdentityForStoredUserSession(
      {
        SESSIONS: {
          get: async () => "{bad json",
        },
      } as unknown as Env,
      "user-1",
    );

    expect(result).toBeNull();
  });

  it("ignores malformed persisted identity preferences and falls back to hydrated session data", async () => {
    const state = await readCommitIdentityStateForUser(
      {
        SESSIONS: {
          get: async () => "{bad json",
        },
      } as unknown as Env,
      {
        userId: "user-1",
        session: {
          userId: "user-1",
          login: "puneet",
          avatar: "",
          email: "puneet@example.com",
          name: "Puneet Pal Singh",
          encryptedToken: "encrypted-token",
          createdAt: Date.now(),
        },
      },
    );

    expect(state).toEqual({
      state: "ready",
      identity: {
        authorName: "Puneet Pal Singh",
        authorEmail: "puneet@example.com",
        source: "github_profile",
        verified: true,
      },
    });
  });

  it("rejects explicit commit identities that omit the author name", async () => {
    await expect(
      resolveCommitIdentityForCommit(
        {
          SESSIONS: {
            put: async () => undefined,
          },
        } as unknown as Env,
        null,
        {
          authorName: "   ",
          authorEmail: "puneet@example.com",
        },
      ),
    ).rejects.toMatchObject<Partial<CommitIdentityError>>({
      code: "COMMIT_IDENTITY_INCOMPLETE",
      metadata: {
        commitIdentity: {
          state: "requires_input",
          reason: "missing_name",
        },
      },
    });
  });
});
