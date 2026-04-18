import { describe, expect, it, vi } from "vitest";
import { RunEventRepository } from "./RunEventRepository.js";
import { RunEventRecorder } from "./RunEventRecorder.js";

describe("RunEventRecorder", () => {
  it("keeps idempotent approval-resolved listener failures non-fatal", async () => {
    const repository = {
      appendApprovalResolvedIfMissing: vi.fn(async () => true),
    } as unknown as RunEventRepository;
    const eventListener = vi.fn(async () => {
      throw new Error("listener failure");
    });
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const recorder = new RunEventRecorder(
      repository,
      "run-1",
      "session-1",
      eventListener,
    );

    await expect(
      recorder.recordApprovalResolvedIfNotExists({
        requestId: "req-1",
        decision: "allow_once",
        status: "approved",
      }),
    ).resolves.toBe(true);

    expect(eventListener).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalledWith(
      "[run/events] failed to emit live run event",
      expect.any(Error),
    );
  });
});
