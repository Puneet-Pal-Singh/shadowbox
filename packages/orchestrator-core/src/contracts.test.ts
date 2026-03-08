import { describe, it, expect } from "vitest";
import {
  RUN_STATUSES,
  ORCHESTRATOR_BACKENDS,
  WORKFLOW_STEPS,
  type RunOrchestratorPort,
  type RunStateEnvelope,
  type ScheduledTaskEnvelope,
  OrchestrationError,
  StateMachineError,
  RunManifestMismatchError,
  ORCHESTRATION_ERROR_CODES,
} from "./index.js";

describe("orchestrator-core contracts", () => {
  describe("workflow vocabulary", () => {
    it("exports all canonical run statuses", () => {
      expect(RUN_STATUSES.CREATED).toBe("CREATED");
      expect(RUN_STATUSES.PLANNING).toBe("PLANNING");
      expect(RUN_STATUSES.RUNNING).toBe("RUNNING");
      expect(RUN_STATUSES.PAUSED).toBe("PAUSED");
      expect(RUN_STATUSES.COMPLETED).toBe("COMPLETED");
      expect(RUN_STATUSES.FAILED).toBe("FAILED");
      expect(RUN_STATUSES.CANCELLED).toBe("CANCELLED");
    });

    it("exports all orchestrator backends", () => {
      expect(ORCHESTRATOR_BACKENDS.EXECUTION_ENGINE_V1).toBe("execution-engine-v1");
      expect(ORCHESTRATOR_BACKENDS.CLOUDFLARE_AGENTS).toBe("cloudflare_agents");
    });

    it("exports all workflow steps", () => {
      expect(WORKFLOW_STEPS.PLANNING).toBe("planning");
      expect(WORKFLOW_STEPS.EXECUTION).toBe("execution");
      expect(WORKFLOW_STEPS.SYNTHESIS).toBe("synthesis");
    });
  });

  describe("error contracts", () => {
    it("OrchestrationError carries code", () => {
      const err = new OrchestrationError("test", "INVALID_RUN_TRANSITION");
      expect(err.code).toBe("INVALID_RUN_TRANSITION");
      expect(err.name).toBe("OrchestrationError");
      expect(err).toBeInstanceOf(Error);
    });

    it("StateMachineError has correct code", () => {
      const err = new StateMachineError("bad transition");
      expect(err.code).toBe("INVALID_RUN_TRANSITION");
      expect(err.name).toBe("StateMachineError");
      expect(err.message).toContain("[run/state-machine]");
    });

    it("RunManifestMismatchError has correct code", () => {
      const existing = {
        mode: "agentic",
        providerId: "openai",
        modelId: "gpt-4",
        harness: "cloudflare-sandbox",
        orchestratorBackend: "execution-engine-v1" as const,
      };
      const candidate = { ...existing, modelId: "claude-3" };
      const err = new RunManifestMismatchError(existing, candidate);
      expect(err.code).toBe("RUN_MANIFEST_MISMATCH");
      expect(err.name).toBe("RunManifestMismatchError");
      expect(err.message).toContain("[run/manifest]");
    });

    it("exports all error codes", () => {
      expect(ORCHESTRATION_ERROR_CODES.INVALID_RUN_TRANSITION).toBe("INVALID_RUN_TRANSITION");
      expect(ORCHESTRATION_ERROR_CODES.RUN_MANIFEST_MISMATCH).toBe("RUN_MANIFEST_MISMATCH");
      expect(ORCHESTRATION_ERROR_CODES.ORCHESTRATOR_UNAVAILABLE).toBe("ORCHESTRATOR_UNAVAILABLE");
      expect(ORCHESTRATION_ERROR_CODES.RUN_NOT_FOUND).toBe("RUN_NOT_FOUND");
    });
  });

  describe("contract shapes", () => {
    it("RunOrchestratorPort is structurally compatible", () => {
      const mock: RunOrchestratorPort = {
        getRunState: async (_runId: string) => null,
        transitionRun: async (_runId: string, _newStatus) => {},
        scheduleNext: async (_runId: string) => null,
      };
      expect(mock).toBeDefined();
    });

    it("RunStateEnvelope has required fields", () => {
      const envelope: RunStateEnvelope = {
        runId: "test-run",
        status: "CREATED",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      expect(envelope.runId).toBe("test-run");
      expect(envelope.status).toBe("CREATED");
    });

    it("ScheduledTaskEnvelope accepts typed input", () => {
      interface MyInput { action: string }
      const envelope: ScheduledTaskEnvelope<MyInput> = {
        taskId: "t1",
        input: { action: "analyze" },
      };
      expect(envelope.taskId).toBe("t1");
      expect(envelope.input.action).toBe("analyze");
    });
  });
});
