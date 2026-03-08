import { describe, it, expect, vi } from "vitest";
import type {
  RunOrchestratorPort,
  RunStateEnvelope,
  ScheduledTaskEnvelope,
} from "@shadowbox/orchestrator-core";
import { OrchestrationError } from "@shadowbox/orchestrator-core";
import {
  CloudflareAgentsRunOrchestratorAdapter,
  type CloudflareAgentsRunClient,
} from "./CloudflareAgentsRunOrchestratorAdapter.js";
import {
  parseCloudflareAgentsFeatureFlag,
  shouldActivateCloudflareAgentsAdapter,
} from "./activation.js";

interface TaskInput {
  action: string;
}

function createClientMock(): CloudflareAgentsRunClient<TaskInput> {
  return {
    getRunState: vi.fn(),
    transitionRun: vi.fn(),
    scheduleNext: vi.fn(),
  };
}

describe("CloudflareAgentsRunOrchestratorAdapter", () => {
  it("is structurally compatible with RunOrchestratorPort", () => {
    const client = createClientMock();
    const adapter: RunOrchestratorPort<TaskInput> =
      new CloudflareAgentsRunOrchestratorAdapter<TaskInput>(client);

    expect(adapter).toBeDefined();
  });

  it("delegates get/transition/schedule calls to the client", async () => {
    const client = createClientMock();
    const runState: RunStateEnvelope = {
      runId: "run-1",
      status: "RUNNING",
      createdAt: 1,
      updatedAt: 2,
      workflowStep: "execution",
    };
    const scheduledTask: ScheduledTaskEnvelope<TaskInput> = {
      taskId: "task-1",
      input: { action: "analyze" },
    };

    vi.mocked(client.getRunState).mockResolvedValue(runState);
    vi.mocked(client.scheduleNext).mockResolvedValue(scheduledTask);

    const adapter = new CloudflareAgentsRunOrchestratorAdapter<TaskInput>(client);
    await adapter.transitionRun("run-1", "PLANNING");
    const actualState = await adapter.getRunState("run-1");
    const actualTask = await adapter.scheduleNext("run-1");

    expect(client.transitionRun).toHaveBeenCalledWith("run-1", "PLANNING");
    expect(actualState).toEqual(runState);
    expect(actualTask).toEqual(scheduledTask);
  });

  it("maps adapter failures to ORCHESTRATOR_UNAVAILABLE", async () => {
    const client = createClientMock();
    vi.mocked(client.getRunState).mockRejectedValue(new Error("sdk unavailable"));
    const adapter = new CloudflareAgentsRunOrchestratorAdapter<TaskInput>(client);

    await expect(adapter.getRunState("run-2")).rejects.toMatchObject({
      code: "ORCHESTRATOR_UNAVAILABLE",
      name: "OrchestrationError",
    });
  });

  it("preserves typed orchestration errors from client", async () => {
    const client = createClientMock();
    vi.mocked(client.getRunState).mockRejectedValue(
      new OrchestrationError("known error", "RUN_NOT_FOUND"),
    );
    const adapter = new CloudflareAgentsRunOrchestratorAdapter<TaskInput>(client);

    await expect(adapter.getRunState("run-3")).rejects.toMatchObject({
      code: "RUN_NOT_FOUND",
      name: "OrchestrationError",
    });
  });

  it("supports start and cancel lifecycle helpers", async () => {
    const client = createClientMock();
    vi.mocked(client.getRunState).mockResolvedValue({
      runId: "run-4",
      status: "CREATED",
      createdAt: 10,
      updatedAt: 20,
      workflowStep: "planning",
    });

    const adapter = new CloudflareAgentsRunOrchestratorAdapter<TaskInput>(client);
    const started = await adapter.startRun("run-4");
    await adapter.cancelRun("run-4");

    expect(started.status).toBe("CREATED");
    expect(client.transitionRun).toHaveBeenNthCalledWith(1, "run-4", "CREATED");
    expect(client.transitionRun).toHaveBeenNthCalledWith(2, "run-4", "CANCELLED");
  });

  it("fails startRun with RUN_NOT_FOUND if client returns null", async () => {
    const client = createClientMock();
    vi.mocked(client.getRunState).mockResolvedValue(null);
    const adapter = new CloudflareAgentsRunOrchestratorAdapter<TaskInput>(client);

    await expect(adapter.startRun("run-5")).rejects.toMatchObject({
      code: "RUN_NOT_FOUND",
      name: "OrchestrationError",
    });
  });
});

describe("cloudflare agents activation guard", () => {
  it("activates only when backend is cloudflare_agents and feature flag is enabled", () => {
    expect(
      shouldActivateCloudflareAgentsAdapter({
        requestedBackend: "cloudflare_agents",
        featureFlagEnabled: true,
      }),
    ).toBe(true);
    expect(
      shouldActivateCloudflareAgentsAdapter({
        requestedBackend: "cloudflare_agents",
        featureFlagEnabled: false,
      }),
    ).toBe(false);
    expect(
      shouldActivateCloudflareAgentsAdapter({
        requestedBackend: "execution-engine-v1",
        featureFlagEnabled: true,
      }),
    ).toBe(false);
  });

  it("parses feature-flag env values deterministically", () => {
    expect(parseCloudflareAgentsFeatureFlag("true")).toBe(true);
    expect(parseCloudflareAgentsFeatureFlag("1")).toBe(true);
    expect(parseCloudflareAgentsFeatureFlag("false")).toBe(false);
    expect(parseCloudflareAgentsFeatureFlag("0")).toBe(false);
    expect(parseCloudflareAgentsFeatureFlag(undefined)).toBe(false);
  });
});
