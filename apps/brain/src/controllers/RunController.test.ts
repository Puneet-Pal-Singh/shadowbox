import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types/ai";

const runtimeHelpers = vi.hoisted(() => ({
  fetchRunRuntimeRoute: vi.fn(),
}));

vi.mock("./chat-runtime-helpers", () => runtimeHelpers);

import { RunController } from "./RunController";

describe("RunController", () => {
  beforeEach(() => {
    runtimeHelpers.fetchRunRuntimeRoute.mockReset();
  });

  it("proxies canonical run events through the brain worker route", async () => {
    const env = {} as Env;
    runtimeHelpers.fetchRunRuntimeRoute.mockResolvedValueOnce(
      new Response(
        [
          JSON.stringify({
            version: 1,
            eventId: "evt-1",
            runId: "123e4567-e89b-42d3-a456-426614174100",
            sessionId: "session-1",
            timestamp: "2026-03-24T12:00:00.000Z",
            source: "brain",
            type: "tool.requested",
            payload: {
              toolId: "tool-1",
              toolName: "read_file",
              arguments: { path: "README.md" },
            },
          }),
        ].join("\n"),
        {
          status: 200,
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
          },
        },
      ),
    );

    const response = await RunController.getEvents(
      new Request(
        "https://brain.local/api/run/events?runId=123e4567-e89b-42d3-a456-426614174100",
      ),
      env,
    );

    expect(runtimeHelpers.fetchRunRuntimeRoute).toHaveBeenCalledWith(
      env,
      "123e4567-e89b-42d3-a456-426614174100",
      "execution-engine-v1",
      {
        method: "GET",
        path: "/events?runId=123e4567-e89b-42d3-a456-426614174100",
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/x-ndjson; charset=utf-8",
    );
    await expect(response.text()).resolves.toContain('"toolName":"read_file"');
  });

  it("proxies run activity snapshots through the brain worker route", async () => {
    const env = {} as Env;
    runtimeHelpers.fetchRunRuntimeRoute.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          runId: "123e4567-e89b-42d3-a456-426614174101",
          sessionId: "session-1",
          status: "RUNNING",
          items: [
            {
              id: "tool-1",
              kind: "tool",
              toolName: "read_file",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const response = await RunController.getActivity(
      new Request(
        "https://brain.local/api/run/activity?runId=123e4567-e89b-42d3-a456-426614174101",
      ),
      env,
    );

    expect(runtimeHelpers.fetchRunRuntimeRoute).toHaveBeenCalledWith(
      env,
      "123e4567-e89b-42d3-a456-426614174101",
      "execution-engine-v1",
      {
        method: "GET",
        path: "/activity?runId=123e4567-e89b-42d3-a456-426614174101",
      },
    );
    await expect(response.json()).resolves.toMatchObject({
      items: [{ toolName: "read_file" }],
    });
  });
});
