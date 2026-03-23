import { describe, expect, it, vi } from "vitest";
import { RUN_EVENT_TYPES, RUN_WORKFLOW_STEPS } from "@repo/shared-types";
import { RunEngine, type RunEngineDependencies } from "./RunEngine.js";
import { sanitizeUserFacingOutput } from "./RunOutputSanitizer.js";
import type { PlannedTask } from "../planner/PlanSchema.js";
import type {
  RuntimeDurableObjectState,
  RuntimeExecutionService,
  RuntimeStorage,
} from "../types.js";
import type { Task } from "../task/index.js";
import type { ILLMGateway } from "../llm/types.js";
import { Run, RunRepository } from "../run/index.js";
import { CodingAgent } from "../agents/CodingAgent.js";
import { RunEventRepository } from "../events/index.js";

const TEST_RUN_ID = "f462a003-5c36-4c86-a95d-367b92bf46c9";

describe("RunEngine", () => {
  it("preserves structured task input when creating runtime tasks from a plan", () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      createTaskFromPlanned(runId: string, planned: PlannedTask): Task;
    };

    const planned: PlannedTask = {
      id: "1",
      type: "shell",
      description: "Check Node version",
      dependsOn: [],
      expectedOutput: "Node version printed",
      input: { command: "node --version" },
    };

    const task = privateApi.createTaskFromPlanned("run-1", planned);

    expect(task.input.description).toBe("Check Node version");
    expect(task.input.expectedOutput).toBe("Node version printed");
    expect(task.input.command).toBe("node --version");
  });

  it("routes build-mode greetings through the canonical tool-capable loop", async () => {
    const generateText = vi.fn(async () => ({
      text: "ok",
      usage: {
        provider: "mock",
        model: "mock-model",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
    }));
    const llmGateway: ILLMGateway = {
      generateText,
      generateStructured: vi.fn(async () => {
        throw new Error("structured turn classification should be inactive");
      }),
      generateStream: async () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
    };
    const runEngine = createRunEngine({ llmGateway });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "hello",
        sessionId: "session-1",
      },
      [{ role: "user", content: "hello" }],
      {},
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(generateText).toHaveBeenCalledTimes(1);
    const buildRequest = generateText.mock.calls[0]?.[0] as {
      context?: { phase?: string };
    };
    expect(buildRequest.context?.phase).toBe("task");
  });

  it("persists completed build-mode runs before emitting terminal events", async () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      runRepo: {
        update(run: Run): Promise<void>;
      };
      runEventRecorder: {
        recordMessageEmitted(
          role: "user" | "assistant" | "system",
          content: string,
          metadata?: Record<string, unknown>,
        ): Promise<void>;
        recordRunCompleted(
          totalDurationMs: number,
          toolsUsed: number,
        ): Promise<void>;
      };
    };
    const callOrder: string[] = [];
    const originalUpdate = privateApi.runRepo.update.bind(privateApi.runRepo);
    const originalRecordMessageEmitted =
      privateApi.runEventRecorder.recordMessageEmitted.bind(
        privateApi.runEventRecorder,
      );
    const originalRecordRunCompleted =
      privateApi.runEventRecorder.recordRunCompleted.bind(
        privateApi.runEventRecorder,
      );

    vi.spyOn(privateApi.runRepo, "update").mockImplementation(async (run) => {
      if (run.status === "COMPLETED") {
        callOrder.push("update");
      }
      return originalUpdate(run);
    });
    vi.spyOn(
      privateApi.runEventRecorder,
      "recordMessageEmitted",
    ).mockImplementation(async (role, content, metadata) => {
      if (role === "assistant") {
        callOrder.push("message");
      }
      return originalRecordMessageEmitted(role, content, metadata);
    });
    vi.spyOn(
      privateApi.runEventRecorder,
      "recordRunCompleted",
    ).mockImplementation(async (totalDurationMs, toolsUsed) => {
      callOrder.push("completed");
      return originalRecordRunCompleted(totalDurationMs, toolsUsed);
    });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "hello",
        sessionId: "session-1",
      },
      [{ role: "user", content: "hello" }],
      {},
    );

    expect(response.status).toBe(200);
    expect(callOrder).toEqual(["update", "message", "completed"]);
  });

  it("returns a user-facing recovery message when explicit plan mode produces invalid structured output", async () => {
    const llmGateway: ILLMGateway = {
      generateText: async () => ({
        text: "unused",
        usage: {
          provider: "mock",
          model: "mock-model",
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
        },
      }),
      generateStructured: vi
        .fn()
        .mockRejectedValue(
          new Error("No object generated: response did not match schema."),
        ),
      generateStream: async () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
    };
    const runEngine = createRunEngine({ llmGateway });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        mode: "plan",
        prompt: "continue with that",
        sessionId: "session-1",
      },
      [
        {
          role: "assistant",
          content:
            "I can inspect the repository and summarize the current state.",
        },
        {
          role: "user",
          content: "continue with that",
        },
      ],
      {},
    );

    expect(response.status).toBe(200);
    const output = await response.text();
    expect(output).toContain("couldn't generate a valid structured plan");

    const persisted = await (
      runEngine as unknown as {
        getRun(runId: string): Promise<Run | null>;
        memoryCoordinator: {
          getCheckpointForResume(runId: string): Promise<
            | {
                phase: string;
                runStatus: string;
              }
            | undefined
          >;
        };
      }
    ).getRun(TEST_RUN_ID);
    const checkpoint = await (
      runEngine as unknown as {
        memoryCoordinator: {
          getCheckpointForResume(runId: string): Promise<
            | {
                phase: string;
                runStatus: string;
              }
            | undefined
          >;
        };
      }
    ).memoryCoordinator.getCheckpointForResume(TEST_RUN_ID);

    expect(persisted?.status).toBe("COMPLETED");
    expect(persisted?.metadata.error).toBe(
      "PLANNER_INVALID_RESPONSE: Planner returned invalid structured output.",
    );
    expect(persisted?.metadata.phaseSelectionSnapshots?.synthesis).toEqual(
      persisted?.metadata.manifest,
    );
    expect(checkpoint).toMatchObject({
      phase: "synthesis",
      runStatus: "COMPLETED",
    });
  });

  it("persists PLANNING status before calling the explicit planner", async () => {
    const state = new MockRuntimeState();
    let observedPlanningStatus: string | null = null;
    const llmGateway: ILLMGateway = {
      generateText: async () => ({
        text: "Execution complete",
        usage: {
          provider: "mock",
          model: "mock-model",
          promptTokens: 5,
          completionTokens: 5,
          totalTokens: 10,
        },
      }),
      generateStructured: async (request) => {
        if (request.context.phase !== "planning") {
          throw new Error("unexpected structured phase");
        }

        observedPlanningStatus =
          (await new RunRepository(state).getById(TEST_RUN_ID))?.status ?? null;

        return {
          object: {
            tasks: [],
            metadata: { estimatedSteps: 1 },
          },
          usage: {
            provider: "mock",
            model: "mock-model",
            promptTokens: 5,
            completionTokens: 5,
            totalTokens: 10,
          },
        };
      },
      generateStream: async () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
    };
    const runEngine = createRunEngineForRun({
      state,
      dependencies: { llmGateway },
    });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        mode: "plan",
        prompt: "plan it",
        sessionId: "session-1",
      },
      [{ role: "user", content: "plan it" }],
      {},
    );

    expect(response.status).toBe(200);
    expect(observedPlanningStatus).toBe("PLANNING");
  });

  it("persists explicit-plan terminal state before emitting completion events", async () => {
    const runEngine = createRunEngine({
      llmGateway: createMockLLMGateway(),
    });
    const privateApi = runEngine as unknown as {
      runRepo: {
        update(run: Run): Promise<void>;
      };
      runEventRecorder: {
        recordMessageEmitted(
          role: "user" | "assistant" | "system",
          content: string,
          metadata?: Record<string, unknown>,
        ): Promise<void>;
        recordRunCompleted(
          totalDurationMs: number,
          toolsUsed: number,
        ): Promise<void>;
      };
    };
    const callOrder: string[] = [];
    const originalUpdate = privateApi.runRepo.update.bind(privateApi.runRepo);
    const originalRecordMessageEmitted =
      privateApi.runEventRecorder.recordMessageEmitted.bind(
        privateApi.runEventRecorder,
      );
    const originalRecordRunCompleted =
      privateApi.runEventRecorder.recordRunCompleted.bind(
        privateApi.runEventRecorder,
      );

    vi.spyOn(privateApi.runRepo, "update").mockImplementation(async (run) => {
      if (run.status === "COMPLETED") {
        callOrder.push("update");
      }
      return originalUpdate(run);
    });
    vi.spyOn(
      privateApi.runEventRecorder,
      "recordMessageEmitted",
    ).mockImplementation(async (role, content, metadata) => {
      if (role === "assistant") {
        callOrder.push("message");
      }
      return originalRecordMessageEmitted(role, content, metadata);
    });
    vi.spyOn(
      privateApi.runEventRecorder,
      "recordRunCompleted",
    ).mockImplementation(async (totalDurationMs, toolsUsed) => {
      callOrder.push("completed");
      return originalRecordRunCompleted(totalDurationMs, toolsUsed);
    });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        mode: "plan",
        prompt: "plan this",
        sessionId: "session-1",
      },
      [{ role: "user", content: "plan this" }],
      {},
    );

    expect(response.status).toBe(200);
    expect(callOrder).toEqual(["update", "message", "completed"]);
  });

  it("build mode bypasses planner and reads files through the canonical tool loop", async () => {
    const planner = {
      plan: vi.fn(async () => {
        throw new Error(
          "planner should not be called for build-mode read requests",
        );
      }),
    } as unknown as RunEngineDependencies["planner"];
    const executionService: RuntimeExecutionService = {
      execute: vi.fn(async () => ({
        success: true,
        output: "# Shadowbox\n",
      })),
    };
    const generateText = vi
      .fn()
      .mockResolvedValueOnce({
        text: "Reading the requested file.",
        toolCalls: [
          {
            id: "call-1",
            toolName: "read_file",
            args: { path: "README.md" },
          },
        ],
        usage: {
          provider: "mock",
          model: "mock-model",
          promptTokens: 3,
          completionTokens: 6,
          totalTokens: 9,
        },
      })
      .mockResolvedValueOnce({
        text: "README reviewed.",
        toolCalls: [],
        usage: {
          provider: "mock",
          model: "mock-model",
          promptTokens: 4,
          completionTokens: 5,
          totalTokens: 9,
        },
      });
    const llmGateway: ILLMGateway = {
      generateText,
      generateStructured: vi.fn(async () => {
        throw new Error(
          "structured planning should be inactive for build mode",
        );
      }),
      generateStream: async () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
    };
    const runEngine = new RunEngine(
      new MockRuntimeState(),
      {
        env: { NODE_ENV: "test" } as unknown,
        sessionId: "session-1",
        runId: TEST_RUN_ID,
      },
      new CodingAgent(llmGateway, executionService),
      undefined,
      { llmGateway, planner },
    );

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "read README.md",
        sessionId: "session-1",
      },
      [
        { role: "system", content: "internal system prompt" },
        { role: "assistant", content: "previous assistant reply" },
        { role: "user", content: "read README.md" },
      ],
      {},
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("README reviewed.");
    expect(planner.plan).not.toHaveBeenCalled();
    expect(executionService.execute).toHaveBeenCalledWith(
      "filesystem",
      "read_file",
      { path: "README.md" },
    );
  });

  it("keeps build mode running when planner would fail, because planner is inactive", async () => {
    const planner = {
      plan: vi.fn(async () => {
        throw new Error("planner timed out");
      }),
    } as unknown as RunEngineDependencies["planner"];
    const llmGateway = createMockLLMGateway();
    const runEngine = createRunEngine({ llmGateway, planner });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "hello there",
        sessionId: "session-1",
      },
      [{ role: "user", content: "hello there" }],
      {},
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(planner.plan).not.toHaveBeenCalled();
  });

  it("keeps explicit plan mode on the structured planner path", async () => {
    const planner = {
      plan: vi.fn(async () => ({
        tasks: [],
        metadata: { estimatedSteps: 1 },
      })),
    } as unknown as RunEngineDependencies["planner"];
    const runEngine = createRunEngine({
      llmGateway: createMockLLMGateway(),
      planner,
    });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        mode: "plan",
        prompt: "make a plan for the README changes",
        sessionId: "session-1",
      },
      [{ role: "user", content: "make a plan for the README changes" }],
      {},
    );

    expect(response.status).toBe(200);
    expect(planner.plan).toHaveBeenCalledTimes(1);
  });

  it("completes explicit plan mode with a preserved handoff artifact and no task execution", async () => {
    const planner = {
      plan: vi.fn(async () => ({
        tasks: [
          {
            id: "task-1",
            type: "edit",
            description: "Update the README introduction",
            dependsOn: [],
            expectedOutput: "README intro is refreshed",
            input: { path: "README.md", content: "# Updated" },
          },
        ],
        metadata: {
          estimatedSteps: 1,
          reasoning: "Refresh the README copy before validating the update.",
        },
      })),
    } as unknown as RunEngineDependencies["planner"];
    const scheduler = {
      execute: vi.fn(async () => {
        throw new Error("scheduler should not run in explicit plan mode");
      }),
    } as unknown as RunEngineDependencies["scheduler"];
    const runEngine = createRunEngine({
      llmGateway: createMockLLMGateway(),
      planner,
      scheduler,
    });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        mode: "plan",
        prompt: "refresh the README intro",
        sessionId: "session-1",
      },
      [{ role: "user", content: "refresh the README intro" }],
      {},
    );

    const output = await response.text();
    const persisted = await (
      runEngine as unknown as {
        getRun(runId: string): Promise<Run | null>;
        getTasksForRun(runId: string): Promise<Task[]>;
      }
    ).getRun(TEST_RUN_ID);
    const tasks = await (
      runEngine as unknown as {
        getTasksForRun(runId: string): Promise<Task[]>;
      }
    ).getTasksForRun(TEST_RUN_ID);

    expect(response.status).toBe(200);
    expect(output).toContain("No files, commands, or mutating tools were run");
    expect(output).toContain("Switch to Build mode");
    expect(scheduler.execute).not.toHaveBeenCalled();
    expect(tasks).toHaveLength(0);
    expect(persisted?.metadata.planArtifact).toMatchObject({
      estimatedSteps: 1,
      summary: "Refresh the README copy before validating the update.",
      handoff: {
        targetMode: "build",
      },
    });
    expect(persisted?.metadata.planArtifact?.tasks).toEqual([
      expect.objectContaining({
        id: "task-1",
        type: "edit",
        executionKind: "mutating",
      }),
    ]);
  });

  it("skips build-only approval and bootstrap gates in explicit plan mode", async () => {
    const planner = {
      plan: vi.fn(async () => ({
        tasks: [
          {
            id: "task-1",
            type: "analyze",
            description: "Inspect the current repository state",
            dependsOn: [],
            expectedOutput: "Current state understood",
            input: { path: "README.md" },
          },
        ],
        metadata: { estimatedSteps: 1 },
      })),
    } as unknown as RunEngineDependencies["planner"];
    const workspaceBootstrapper = {
      bootstrap: vi.fn(async () => ({
        status: "sync-failed" as const,
        message: "bootstrap should be skipped in plan mode",
      })),
    };
    const runEngine = createRunEngine({
      llmGateway: createMockLLMGateway(),
      planner,
      workspaceBootstrapper,
    });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        mode: "plan",
        prompt:
          "delete the old branch and force push once you inspect the repo",
        sessionId: "session-1",
        repositoryContext: {
          owner: "shadowbox",
          repo: "shadowbox",
          branch: "main",
        },
      },
      [
        {
          role: "user",
          content:
            "delete the old branch and force push once you inspect the repo",
        },
      ],
      {},
    );

    const output = await response.text();

    expect(response.status).toBe(200);
    expect(planner.plan).toHaveBeenCalledTimes(1);
    expect(workspaceBootstrapper.bootstrap).not.toHaveBeenCalled();
    expect(output).not.toContain("approval");
    expect(output).toContain("Plan mode prepared a safe execution outline");
  });

  it("emits canonical run and tool lifecycle events for build-mode tool runs", async () => {
    const state = new MockRuntimeState();
    const llmGateway: ILLMGateway = {
      generateText: vi
        .fn()
        .mockResolvedValueOnce({
          text: "Reading the requested file.",
          toolCalls: [
            {
              id: "call-1",
              toolName: "read_file",
              args: { path: "README.md" },
            },
          ],
          usage: {
            provider: "mock",
            model: "mock-model",
            promptTokens: 3,
            completionTokens: 6,
            totalTokens: 9,
          },
        })
        .mockResolvedValueOnce({
          text: "README reviewed.",
          toolCalls: [],
          usage: {
            provider: "mock",
            model: "mock-model",
            promptTokens: 4,
            completionTokens: 5,
            totalTokens: 9,
          },
        }),
      generateStructured: vi.fn(async () => {
        throw new Error(
          "structured planning should be inactive for build mode",
        );
      }),
      generateStream: async () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
    };
    const runEngine = createRunEngineForRun({
      state,
      dependencies: { llmGateway },
    });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "read README.md",
        sessionId: "session-1",
      },
      [{ role: "user", content: "read README.md" }],
      {},
    );

    expect(response.status).toBe(200);

    const events = await new RunEventRepository(state).getByRun(TEST_RUN_ID);
    expect(events.map((event) => event.type)).toEqual([
      RUN_EVENT_TYPES.RUN_STARTED,
      RUN_EVENT_TYPES.MESSAGE_EMITTED,
      RUN_EVENT_TYPES.RUN_STATUS_CHANGED,
      RUN_EVENT_TYPES.TOOL_REQUESTED,
      RUN_EVENT_TYPES.TOOL_STARTED,
      RUN_EVENT_TYPES.TOOL_COMPLETED,
      RUN_EVENT_TYPES.RUN_STATUS_CHANGED,
      RUN_EVENT_TYPES.MESSAGE_EMITTED,
      RUN_EVENT_TYPES.RUN_COMPLETED,
    ]);
    expect(events[1]).toMatchObject({
      payload: {
        role: "user",
        content: "read README.md",
      },
    });
    expect(events[2]).toMatchObject({
      payload: { workflowStep: RUN_WORKFLOW_STEPS.EXECUTION },
    });
    expect(events[6]).toMatchObject({
      payload: { workflowStep: RUN_WORKFLOW_STEPS.SYNTHESIS },
    });
    expect(
      events.filter((event) => event.type === RUN_EVENT_TYPES.MESSAGE_EMITTED),
    ).toMatchObject([
      {
        payload: {
          role: "user",
          content: "read README.md",
        },
      },
      {
        payload: {
          role: "assistant",
          content: "README reviewed.",
        },
      },
    ]);
  });

  it.skip("executes direct write-file requests through CodingAgent without planner decomposition", async () => {
    const planner = {
      plan: vi.fn(async () => {
        throw new Error(
          "planner should not be called for direct write requests",
        );
      }),
    } as unknown as RunEngineDependencies["planner"];
    const executionService: RuntimeExecutionService = {
      execute: vi.fn(async () => ({
        success: true,
        output: "Wrote 11 bytes to README.md",
      })),
    };
    const llmGateway = createMockLLMGateway();
    const runEngine = new RunEngine(
      new MockRuntimeState(),
      {
        env: { NODE_ENV: "test" } as unknown,
        sessionId: "session-1",
        runId: TEST_RUN_ID,
      },
      new CodingAgent(llmGateway, executionService),
      undefined,
      { llmGateway, planner },
    );

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "write README.md\n```md\n# Shadowbox\n```",
        sessionId: "session-1",
      },
      [{ role: "user", content: "write README.md\n```md\n# Shadowbox\n```" }],
      {},
    );

    expect(response.status).toBe(200);
    expect(planner.plan).not.toHaveBeenCalled();
    expect(executionService.execute).toHaveBeenCalledWith(
      "filesystem",
      "write_file",
      {
        path: "README.md",
        content: "# Shadowbox",
      },
    );
  });

  it("executes active agentic loop path when feature flag is enabled", async () => {
    const generateText = vi
      .fn()
      .mockResolvedValueOnce({
        text: "I will inspect the file first.",
        toolCalls: [
          {
            id: "call-1",
            toolName: "read_file",
            args: { path: "README.md" },
          },
        ],
        usage: {
          provider: "mock",
          model: "mock-model",
          promptTokens: 3,
          completionTokens: 6,
          totalTokens: 9,
        },
      })
      .mockResolvedValueOnce({
        text: "README inspection complete.",
        toolCalls: [],
        usage: {
          provider: "mock",
          model: "mock-model",
          promptTokens: 4,
          completionTokens: 5,
          totalTokens: 9,
        },
      });
    const llmGateway: ILLMGateway = {
      generateText,
      generateStructured: async () => ({
        object: { tasks: [], metadata: { estimatedSteps: 1 } },
        usage: {
          provider: "mock",
          model: "mock-model",
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
        },
      }),
      generateStream: async () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
    };
    const planner = {
      plan: vi.fn(async () => ({
        tasks: [],
        metadata: { estimatedSteps: 1 },
      })),
    } as unknown as RunEngineDependencies["planner"];
    const runEngine = createRunEngine({ llmGateway, planner });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "inspect README and summarize it",
        sessionId: "session-1",
        repositoryContext: {
          owner: "sourcegraph",
          repo: "shadowbox",
        },
        metadata: {
          featureFlags: {
            agenticLoopV1: true,
          },
        },
      },
      [{ role: "user", content: "inspect README and summarize it" }],
      {},
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("README inspection complete.");
    expect(generateText).toHaveBeenCalledTimes(2);
    const firstRequest = generateText.mock.calls[0]?.[0] as {
      tools?: Record<string, unknown>;
    };
    expect(firstRequest.tools).toBeDefined();
    expect(Object.keys(firstRequest.tools ?? {})).toContain("read_file");
    expect(planner.plan).not.toHaveBeenCalled();

    const persisted = await (
      runEngine as unknown as {
        getRun(runId: string): Promise<Run | null>;
      }
    ).getRun(TEST_RUN_ID);
    expect(persisted?.metadata.agenticLoop?.enabled).toBe(true);
    expect(persisted?.metadata.agenticLoop?.stopReason).toBe("llm_stop");
    expect(persisted?.metadata.agenticLoop?.toolExecutionCount).toBe(1);
  });

  it("answers build-mode prompts without invoking structured turn classification", async () => {
    const generateText = vi.fn(async () => ({
      text: "Longer budget applied.",
      usage: {
        provider: "mock",
        model: "mock-model",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
    }));
    const generateStructured = vi.fn(async () => ({
      object: { mode: "chat", rationale: "simple greeting" },
      usage: {
        provider: "mock",
        model: "mock-model",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
    }));
    const llmGateway: ILLMGateway = {
      generateText,
      generateStructured,
      generateStream: async () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
    };
    const runEngine = createRunEngine({ llmGateway });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "hello",
        sessionId: "session-1",
      },
      [{ role: "user", content: "hello" }],
      {},
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Longer budget applied.");
    expect(generateStructured).not.toHaveBeenCalled();
    const buildRequest = generateText.mock.calls[0]?.[0] as {
      context?: { phase?: string };
    };
    expect(buildRequest.context?.phase).toBe("task");
  });

  it("completes the golden-flow tool roundtrip in one agentic run", async () => {
    const generateText = vi
      .fn()
      .mockResolvedValueOnce({
        text: "Executing golden flow tools now.",
        toolCalls: [
          { id: "t1", toolName: "list_files", args: { path: "." } },
          { id: "t2", toolName: "read_file", args: { path: "README.md" } },
          {
            id: "t3",
            toolName: "write_file",
            args: { path: "README.md", content: "# Updated README\n" },
          },
          {
            id: "t4",
            toolName: "run_command",
            args: { command: "pnpm --filter @shadowbox/execution-engine test" },
          },
          { id: "t5", toolName: "git_diff", args: {} },
        ],
        usage: {
          provider: "mock",
          model: "mock-model",
          promptTokens: 10,
          completionTokens: 10,
          totalTokens: 20,
        },
      })
      .mockResolvedValueOnce({
        text: "Golden flow completed without retries.",
        toolCalls: [],
        usage: {
          provider: "mock",
          model: "mock-model",
          promptTokens: 8,
          completionTokens: 6,
          totalTokens: 14,
        },
      });

    const llmGateway: ILLMGateway = {
      generateText,
      generateStructured: async () => ({
        object: { tasks: [], metadata: { estimatedSteps: 1 } },
        usage: {
          provider: "mock",
          model: "mock-model",
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
        },
      }),
      generateStream: async () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
    };

    const executionService: RuntimeExecutionService = {
      execute: vi.fn(
        async (
          plugin: string,
          action: string,
          payload: Record<string, unknown>,
        ) => {
          if (plugin === "filesystem" && action === "list_files") {
            return { success: true, output: "README.md\npackages/\n" };
          }
          if (plugin === "filesystem" && action === "read_file") {
            return { success: true, output: "# Shadowbox\n" };
          }
          if (plugin === "filesystem" && action === "write_file") {
            return { success: true, output: "Wrote 17 bytes to README.md" };
          }
          if (plugin === "node" && action === "run") {
            return { success: true, output: "test suite passed\n" };
          }
          if (plugin === "git" && action === "git_diff") {
            return {
              success: true,
              output: "diff --git a/README.md b/README.md",
            };
          }
          return {
            success: false,
            error: `Unexpected route ${plugin}:${action} ${JSON.stringify(payload)}`,
          };
        },
      ),
    };

    const runEngine = new RunEngine(
      new MockRuntimeState(),
      {
        env: { NODE_ENV: "test" } as unknown,
        sessionId: "session-1",
        runId: TEST_RUN_ID,
        correlationId: "corr-golden-flow",
      },
      new CodingAgent(llmGateway, executionService),
      undefined,
      { llmGateway },
    );

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "Find the target file, update it, run tests, and show git diff",
        sessionId: "session-1",
        repositoryContext: { owner: "sourcegraph", repo: "shadowbox" },
        metadata: { featureFlags: { agenticLoopV1: true } },
      },
      [
        {
          role: "user",
          content:
            "Find the target file, update it, run tests, and show git diff",
        },
      ],
      {},
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Golden flow completed");

    const executeSpy = executionService.execute as ReturnType<typeof vi.fn>;
    expect(executeSpy).toHaveBeenCalledWith("filesystem", "list_files", {
      path: ".",
    });
    expect(executeSpy).toHaveBeenCalledWith("filesystem", "read_file", {
      path: "README.md",
    });
    expect(executeSpy).toHaveBeenCalledWith("filesystem", "write_file", {
      path: "README.md",
      content: "# Updated README\n",
    });
    expect(executeSpy).toHaveBeenCalledWith("node", "run", {
      command: "pnpm --filter @shadowbox/execution-engine test",
    });
    expect(executeSpy).toHaveBeenCalledWith("git", "git_diff", {});

    const persisted = await (
      runEngine as unknown as {
        getRun(runId: string): Promise<Run | null>;
      }
    ).getRun(TEST_RUN_ID);
    expect(persisted?.metadata.agenticLoop?.stopReason).toBe("llm_stop");
    expect(persisted?.metadata.agenticLoop?.toolExecutionCount).toBe(5);
    expect(persisted?.metadata.agenticLoop?.failedToolCount).toBe(0);
    expect(persisted?.metadata.agenticLoop?.toolLifecycle).toHaveLength(15);
    expect(persisted?.metadata.agenticLoop?.toolLifecycle?.[0]).toMatchObject({
      toolCallId: "t1",
      toolName: "list_files",
      status: "requested",
      mutating: false,
    });
  });

  it("returns a truthful fallback summary when a build-mode tool fails", async () => {
    const generateText = vi.fn().mockResolvedValue({
      text: "I'll update the file now.",
      toolCalls: [
        {
          id: "write-1",
          toolName: "write_file",
          args: { path: "README.md", content: "# Broken\n" },
        },
      ],
      usage: {
        provider: "mock",
        model: "mock-model",
        promptTokens: 3,
        completionTokens: 5,
        totalTokens: 8,
      },
    });

    const llmGateway: ILLMGateway = {
      generateText,
      generateStructured: async () => ({
        object: { tasks: [], metadata: { estimatedSteps: 1 } },
        usage: {
          provider: "mock",
          model: "mock-model",
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
        },
      }),
      generateStream: async () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
    };

    const executionService: RuntimeExecutionService = {
      execute: vi.fn(async () => ({
        success: false,
        error: "Permission denied",
      })),
    };

    const runEngine = new RunEngine(
      new MockRuntimeState(),
      {
        env: { NODE_ENV: "test" } as unknown,
        sessionId: "session-1",
        runId: TEST_RUN_ID,
        correlationId: "corr-tool-failure",
      },
      new CodingAgent(llmGateway, executionService),
      undefined,
      { llmGateway },
    );

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "update README.md",
        sessionId: "session-1",
        repositoryContext: { owner: "sourcegraph", repo: "shadowbox" },
        metadata: { featureFlags: { agenticLoopV1: true } },
      },
      [{ role: "user", content: "update README.md" }],
      {},
    );

    expect(response.status).toBe(200);
    const output = await response.text();
    expect(output).toContain("The build loop stopped after a tool failure.");
    expect(output).toContain(
      "Failures: write_file (write-1): Permission denied",
    );
    expect(output).not.toContain("I'll update the file now.");

    const persisted = await (
      runEngine as unknown as {
        getRun(runId: string): Promise<Run | null>;
      }
    ).getRun(TEST_RUN_ID);
    expect(persisted?.metadata.agenticLoop?.stopReason).toBe("tool_error");
    expect(
      persisted?.metadata.agenticLoop?.toolLifecycle?.map(
        (event) => event.status,
      ),
    ).toEqual(["requested", "started", "failed"]);
  });

  it("enforces the bounded golden-flow tool floor for agentic-loop tool maps", async () => {
    const generateText = vi.fn().mockResolvedValue({
      text: "done",
      toolCalls: [],
      usage: {
        provider: "mock",
        model: "mock-model",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
    });
    const llmGateway: ILLMGateway = {
      generateText,
      generateStructured: async () => ({
        object: { tasks: [], metadata: { estimatedSteps: 1 } },
        usage: {
          provider: "mock",
          model: "mock-model",
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
        },
      }),
      generateStream: async () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
    };
    const runEngine = createRunEngine({ llmGateway });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "inspect repository",
        sessionId: "session-1",
        metadata: { featureFlags: { agenticLoopV1: true } },
        repositoryContext: { owner: "sourcegraph", repo: "shadowbox" },
      },
      [{ role: "user", content: "inspect repository" }],
      {
        web_search: {
          description: "not in scope",
        } as unknown as import("ai").CoreTool,
      },
    );

    expect(response.status).toBe(200);
    const firstRequest = generateText.mock.calls[0]?.[0] as {
      tools?: Record<string, unknown>;
    };
    const toolNames = Object.keys(firstRequest.tools ?? {});
    expect(toolNames).toContain("read_file");
    expect(toolNames).toContain("grep");
    expect(toolNames).not.toContain("web_search");
  });

  it("sanitizes internal runtime paths in user-facing output", () => {
    const leaked =
      "cat: /home/sandbox/runs/5212f17b-eb1f-463f-a41f-2c4c6b9d4ba6/README.md: No such file or directory\nSee https://internal/debug";
    const sanitized = sanitizeUserFacingOutput(leaked);

    expect(sanitized).not.toContain(
      "/home/sandbox/runs/5212f17b-eb1f-463f-a41f-2c4c6b9d4ba6/",
    );
    expect(sanitized).toContain(
      "The requested file was not found in the current workspace.",
    );
    expect(sanitized).toContain("[internal-url]");
  });

  it("marks CREATED runs as FAILED when execution error handling runs", async () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      runRepo: {
        create(run: Run): Promise<void>;
        update(run: Run): Promise<void>;
        getById(runId: string): Promise<Run | null>;
      };
      runEventRecorder: {
        recordRunFailed(error: string, totalDurationMs: number): Promise<void>;
      };
      handleExecutionError(runId: string, error: unknown): Promise<void>;
    };
    const callOrder: string[] = [];
    const originalUpdate = privateApi.runRepo.update.bind(privateApi.runRepo);
    const originalRecordRunFailed =
      privateApi.runEventRecorder.recordRunFailed.bind(
        privateApi.runEventRecorder,
      );

    const run = new Run("run-created", "session-1", "CREATED", "coding", {
      agentType: "coding",
      prompt: "check repo",
      sessionId: "session-1",
    });
    await privateApi.runRepo.create(run);
    vi.spyOn(privateApi.runRepo, "update").mockImplementation(
      async (nextRun) => {
        if (nextRun.id === "run-created" && nextRun.status === "FAILED") {
          callOrder.push("update");
        }
        return originalUpdate(nextRun);
      },
    );
    vi.spyOn(privateApi.runEventRecorder, "recordRunFailed").mockImplementation(
      async (error, totalDurationMs) => {
        callOrder.push("failed");
        return originalRecordRunFailed(error, totalDurationMs);
      },
    );

    await privateApi.handleExecutionError("run-created", new Error("boom"));

    const persisted = await privateApi.runRepo.getById("run-created");
    expect(persisted?.status).toBe("FAILED");
    expect(persisted?.metadata.error).toBe("boom");
    expect(callOrder).toEqual(["update", "failed"]);
  });

  it("enforces immutable run manifest for active runs", async () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      getOrCreateRun(
        input: {
          agentType: "coding";
          prompt: string;
          sessionId: string;
          providerId?: string;
          modelId?: string;
        },
        runId: string,
        sessionId: string,
      ): Promise<Run>;
      taskRepo: {
        create(task: {
          id: string;
          runId: string;
          toJSON(): unknown;
        }): Promise<void>;
      };
    };

    await privateApi.getOrCreateRun(
      {
        agentType: "coding",
        prompt: "run once",
        sessionId: "session-1",
        providerId: "openai",
        modelId: "gpt-4o",
      },
      TEST_RUN_ID,
      "session-1",
    );

    // Seed a task so the CREATED run is non-idle and manifest is enforced
    const { Task: TaskClass } = await import("../task/index.js");
    const seedTask = new TaskClass(
      "manifest-guard-task",
      TEST_RUN_ID,
      "shell",
      "PENDING",
      [],
      { description: "guard task" },
    );
    await privateApi.taskRepo.create(seedTask);

    await expect(
      privateApi.getOrCreateRun(
        {
          agentType: "coding",
          prompt: "same run id, different provider",
          sessionId: "session-1",
          providerId: "groq",
          modelId: "llama-3.3-70b-versatile",
        },
        TEST_RUN_ID,
        "session-1",
      ),
    ).rejects.toThrow("Immutable run manifest mismatch");
  });

  it("recycles idle CREATED run with no tasks when selection changes", async () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      getOrCreateRun(
        input: {
          agentType: "coding";
          prompt: string;
          sessionId: string;
          providerId?: string;
          modelId?: string;
        },
        runId: string,
        sessionId: string,
      ): Promise<Run>;
    };

    await privateApi.getOrCreateRun(
      {
        agentType: "coding",
        prompt: "initial idle run",
        sessionId: "session-1",
        providerId: "openai",
        modelId: "gpt-4o",
      },
      TEST_RUN_ID,
      "session-1",
    );

    const recycled = await privateApi.getOrCreateRun(
      {
        agentType: "coding",
        prompt: "switch provider while idle",
        sessionId: "session-1",
        providerId: "groq",
        modelId: "llama-3.3-70b-versatile",
      },
      TEST_RUN_ID,
      "session-1",
    );

    expect(recycled.status).toBe("CREATED");
    expect(recycled.input.providerId).toBe("groq");
    expect(recycled.input.modelId).toBe("llama-3.3-70b-versatile");
    expect(recycled.metadata.manifest?.providerId).toBe("groq");
    expect(recycled.metadata.manifest?.modelId).toBe("llama-3.3-70b-versatile");
  });

  it("allows selection changes when existing run is terminal", async () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      getOrCreateRun(
        input: {
          agentType: "coding";
          prompt: string;
          sessionId: string;
          providerId?: string;
          modelId?: string;
        },
        runId: string,
        sessionId: string,
      ): Promise<Run>;
      runRepo: {
        update(run: Run): Promise<void>;
      };
    };

    const initialRun = await privateApi.getOrCreateRun(
      {
        agentType: "coding",
        prompt: "run once",
        sessionId: "session-1",
        providerId: "openai",
        modelId: "gpt-4o",
      },
      TEST_RUN_ID,
      "session-1",
    );

    initialRun.transition("RUNNING");
    initialRun.transition("COMPLETED");
    await privateApi.runRepo.update(initialRun);

    const resetRun = await privateApi.getOrCreateRun(
      {
        agentType: "coding",
        prompt: "reuse run id with new model",
        sessionId: "session-1",
        providerId: "groq",
        modelId: "llama-3.3-70b-versatile",
      },
      TEST_RUN_ID,
      "session-1",
    );

    expect(resetRun.status).toBe("CREATED");
    expect(resetRun.input.providerId).toBe("groq");
    expect(resetRun.input.modelId).toBe("llama-3.3-70b-versatile");
    expect(resetRun.metadata.manifest?.providerId).toBe("groq");
    expect(resetRun.metadata.manifest?.modelId).toBe("llama-3.3-70b-versatile");
  });

  it("restores tasks if recyclable-run reset fails after deleting tasks", async () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      getOrCreateRun(
        input: {
          agentType: "coding";
          prompt: string;
          sessionId: string;
          providerId?: string;
          modelId?: string;
        },
        runId: string,
        sessionId: string,
      ): Promise<Run>;
      runRepo: {
        getById(runId: string): Promise<Run | null>;
        update(run: Run): Promise<void>;
      };
      taskRepo: {
        create(task: {
          id: string;
          runId: string;
          toJSON(): unknown;
        }): Promise<void>;
        getByRun(runId: string): Promise<Array<{ id: string }>>;
      };
    };

    const initialRun = await privateApi.getOrCreateRun(
      {
        agentType: "coding",
        prompt: "initial run",
        sessionId: "session-1",
        providerId: "openai",
        modelId: "gpt-4o",
      },
      TEST_RUN_ID,
      "session-1",
    );

    const { Task: TaskClass } = await import("../task/index.js");
    const seedTask = new TaskClass(
      "reset-restore-task",
      TEST_RUN_ID,
      "shell",
      "PENDING",
      [],
      { description: "task to restore after failed reset" },
    );
    await privateApi.taskRepo.create(seedTask);

    initialRun.transition("RUNNING");
    initialRun.transition("COMPLETED");
    await privateApi.runRepo.update(initialRun);

    const originalUpdate = privateApi.runRepo.update.bind(privateApi.runRepo);
    const updateSpy = vi
      .spyOn(privateApi.runRepo, "update")
      .mockImplementation(async (run: Run) => {
        if (
          run.id === TEST_RUN_ID &&
          run.status === "CREATED" &&
          run.input.providerId === "groq"
        ) {
          throw new Error("simulated reset update failure");
        }
        await originalUpdate(run);
      });

    await expect(
      privateApi.getOrCreateRun(
        {
          agentType: "coding",
          prompt: "reuse run with new model",
          sessionId: "session-1",
          providerId: "groq",
          modelId: "llama-3.3-70b-versatile",
        },
        TEST_RUN_ID,
        "session-1",
      ),
    ).rejects.toThrow("simulated reset update failure");

    updateSpy.mockRestore();

    const restoredTasks = await privateApi.taskRepo.getByRun(TEST_RUN_ID);
    expect(restoredTasks).toHaveLength(1);
    expect(restoredTasks[0]?.id).toBe("reset-restore-task");

    const persistedRun = await privateApi.runRepo.getById(TEST_RUN_ID);
    expect(persistedRun?.status).toBe("COMPLETED");
    expect(persistedRun?.input.providerId).toBe("openai");
  });

  it("records immutable selection snapshots for explicit plan runs without execution metadata", async () => {
    const runEngine = createRunEngine({
      llmGateway: createPlanningLLMGateway(),
    });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        mode: "plan",
        prompt: "implement a tiny command task",
        sessionId: "session-1",
        providerId: "openai",
        modelId: "gpt-4o",
        harnessId: "local-sandbox",
      },
      [{ role: "user", content: "implement a tiny command task" }],
      {},
    );

    expect(response.status).toBe(200);

    const persisted = await (
      runEngine as unknown as {
        getRun(runId: string): Promise<Run | null>;
      }
    ).getRun(TEST_RUN_ID);

    const manifest = persisted?.metadata.manifest;
    const snapshots = persisted?.metadata.phaseSelectionSnapshots;
    const lifecycleSteps = persisted?.metadata.lifecycleSteps?.map(
      (entry) => entry.step,
    );
    const telemetry = persisted?.metadata.orchestrationTelemetry;

    expect(manifest).toBeDefined();
    expect(snapshots).toBeDefined();
    expect(snapshots?.planning).toEqual(manifest);
    expect(snapshots?.execution).toBeUndefined();
    expect(snapshots?.synthesis).toEqual(manifest);
    expect(snapshots?.planning).not.toBe(manifest);
    expect(lifecycleSteps).toEqual([
      "RUN_CREATED",
      "CONTEXT_PREPARED",
      "PLAN_VALIDATED",
      "SYNTHESIS",
      "TERMINAL",
    ]);
    expect(telemetry?.wakeupCount).toBe(1);
    expect(telemetry?.resumeCount).toBe(0);
    expect(telemetry?.activeDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("applies reviewer pass when reviewer feature flag is enabled", async () => {
    const llmGateway: ILLMGateway = {
      generateText: async () => ({
        text: "Execution complete",
        usage: {
          provider: "mock",
          model: "mock-model",
          promptTokens: 5,
          completionTokens: 5,
          totalTokens: 10,
        },
      }),
      generateStructured: async (req) => {
        if (req.context.phase === "planning") {
          return {
            object: {
              tasks: [],
              metadata: { estimatedSteps: 1 },
            },
            usage: {
              provider: "mock",
              model: "mock-model",
              promptTokens: 5,
              completionTokens: 5,
              totalTokens: 10,
            },
          };
        }

        return {
          object: {
            verdict: "request_changes",
            summary: "Improve result precision",
            issues: ["Missing implementation detail"],
          },
          usage: {
            provider: "mock",
            model: "mock-model",
            promptTokens: 5,
            completionTokens: 5,
            totalTokens: 10,
          },
        };
      },
      generateStream: async () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
    };
    const runEngine = createRunEngine({ llmGateway });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "implement a tiny command task",
        sessionId: "session-1",
        metadata: {
          featureFlags: {
            reviewerPassV1: true,
          },
        },
      },
      [{ role: "user", content: "implement a tiny command task" }],
      {},
    );

    expect(response.status).toBe(200);
    const output = await response.text();
    expect(output).toContain("Reviewer Note (request_changes)");

    const persisted = await (
      runEngine as unknown as {
        getRun(runId: string): Promise<Run | null>;
      }
    ).getRun(TEST_RUN_ID);
    expect(persisted?.metadata.reviewerPass?.enabled).toBe(true);
    expect(persisted?.metadata.reviewerPass?.verdict).toBe("request_changes");
  });

  it("tracks wakeups and resumptions for pre-existing active runs", async () => {
    const runEngine = createRunEngine({
      llmGateway: createPlanningLLMGateway(),
    });
    const privateApi = runEngine as unknown as {
      getOrCreateRun(
        input: {
          agentType: "coding";
          prompt: string;
          sessionId: string;
          providerId?: string;
          modelId?: string;
        },
        runId: string,
        sessionId: string,
      ): Promise<Run>;
      runRepo: {
        update(run: Run): Promise<void>;
      };
      taskRepo: {
        create(task: {
          id: string;
          runId: string;
          toJSON(): unknown;
        }): Promise<void>;
      };
      getRun(runId: string): Promise<Run | null>;
    };

    const preexistingRun = await privateApi.getOrCreateRun(
      {
        agentType: "coding",
        prompt: "resume marker",
        sessionId: "session-1",
      },
      TEST_RUN_ID,
      "session-1",
    );
    preexistingRun.metadata.orchestrationTelemetry = {
      activeDurationMs: 10,
      wakeupCount: 1,
      resumeCount: 0,
      lastWakeupAt: new Date(Date.now() - 5_000).toISOString(),
    };
    await privateApi.runRepo.update(preexistingRun);

    // Seed a task so the CREATED run is not considered idle-recyclable
    const { Task: TaskClass } = await import("../task/index.js");
    const seedTask = new TaskClass(
      "seed-task-1",
      TEST_RUN_ID,
      "shell",
      "PENDING",
      [],
      { description: "seed task" },
    );
    await privateApi.taskRepo.create(seedTask);

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "continue with a deterministic plan",
        sessionId: "session-1",
      },
      [{ role: "user", content: "continue with a deterministic plan" }],
      {},
    );

    expect(response.status).toBe(200);

    const persisted = await privateApi.getRun(TEST_RUN_ID);
    expect(persisted?.metadata.orchestrationTelemetry?.wakeupCount).toBe(2);
    expect(persisted?.metadata.orchestrationTelemetry?.resumeCount).toBe(1);
    expect(
      persisted?.metadata.orchestrationTelemetry?.activeDurationMs ?? 0,
    ).toBeGreaterThanOrEqual(10);
  });

  it("maintains isolated lifecycle/telemetry state across a run matrix", async () => {
    const state = new MockRuntimeState();
    const runIds = [
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ];
    const sessionIds = [
      "session-matrix-a",
      "session-matrix-a",
      "session-matrix-b",
    ];

    const engines = runIds.map((runId, index) =>
      createRunEngineForRun({
        state,
        runId,
        sessionId: sessionIds[index] ?? "session-matrix-a",
      }),
    );

    await Promise.all(
      engines.map((engine, index) =>
        engine.execute(
          {
            agentType: "coding",
            prompt: `hey from run ${index + 1}`,
            sessionId: sessionIds[index] ?? "session-matrix-a",
          },
          [{ role: "user", content: `hey from run ${index + 1}` }],
          {},
        ),
      ),
    );

    const runs = await Promise.all(
      engines.map((engine, index) => engine.getRun(runIds[index]!)),
    );
    const manifests = runs.map((run) => run?.metadata.manifest);
    const lifecycles = runs.map((run) =>
      run?.metadata.lifecycleSteps?.map((step) => step.step),
    );
    const wakeups = runs.map(
      (run) => run?.metadata.orchestrationTelemetry?.wakeupCount ?? 0,
    );

    expect(new Set(runs.map((run) => run?.id)).size).toBe(3);
    expect(new Set(runs.map((run) => run?.sessionId)).size).toBe(2);
    expect(manifests.every((manifest) => manifest !== undefined)).toBe(true);
    expect(lifecycles.every((steps) => steps?.includes("RUN_CREATED"))).toBe(
      true,
    );
    expect(wakeups).toEqual([1, 1, 1]);
  });

  it("returns a clear auth message when workspace bootstrap needs authorization", async () => {
    const runEngine = createRunEngine({
      workspaceBootstrapper: {
        bootstrap: async () => ({ status: "needs-auth" }),
      },
    });
    const privateApi = runEngine as unknown as {
      getWorkspaceBootstrapMessage(
        runId: string,
        repositoryContext?: { owner?: string; repo?: string; branch?: string },
      ): Promise<string | null>;
    };

    const message = await privateApi.getWorkspaceBootstrapMessage("run-1", {
      owner: "sourcegraph",
      repo: "shadowbox",
      branch: "main",
    });

    expect(message).toContain("GitHub authorization");
  });

  it("blocks cross-repo actions until explicit approval is recorded", async () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      getPermissionPolicyMessage(
        prompt: string,
        repositoryContext?: { owner?: string; repo?: string },
      ): Promise<string | null>;
      processPermissionDirectives(prompt: string): Promise<string | null>;
    };

    const blockedMessage = await privateApi.getPermissionPolicyMessage(
      "check repository acme/platform-core README.md",
      { owner: "sourcegraph", repo: "shadowbox" },
    );
    expect(blockedMessage).toContain("approve cross-repo acme/platform-core");

    const directiveMessage = await privateApi.processPermissionDirectives(
      "approve cross-repo acme/platform-core for 20m",
    );
    expect(directiveMessage).toContain("Cross-repo access approved");

    const allowedMessage = await privateApi.getPermissionPolicyMessage(
      "check repository acme/platform-core README.md",
      { owner: "sourcegraph", repo: "shadowbox" },
    );
    expect(allowedMessage).toBeNull();
  });

  it("blocks destructive operations until explicit approval is recorded", async () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      getPermissionPolicyMessage(
        prompt: string,
        repositoryContext?: { owner?: string; repo?: string },
      ): Promise<string | null>;
      processPermissionDirectives(prompt: string): Promise<string | null>;
    };

    const blockedMessage = await privateApi.getPermissionPolicyMessage(
      "run git reset --hard HEAD~1",
      { owner: "sourcegraph", repo: "shadowbox" },
    );
    expect(blockedMessage).toContain("approve destructive");

    const directiveMessage = await privateApi.processPermissionDirectives(
      "approve destructive for 15m",
    );
    expect(directiveMessage).toContain("Destructive-action approval granted");

    const allowedMessage = await privateApi.getPermissionPolicyMessage(
      "run git reset --hard HEAD~1",
      { owner: "sourcegraph", repo: "shadowbox" },
    );
    expect(allowedMessage).toBeNull();
  });

  it("does not grant approvals from embedded directives in non-approval prompts", async () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      getPermissionPolicyMessage(
        prompt: string,
        repositoryContext?: { owner?: string; repo?: string },
      ): Promise<string | null>;
      processPermissionDirectives(prompt: string): Promise<string | null>;
    };

    const directiveMessage = await privateApi.processPermissionDirectives(
      "Please check repository acme/platform-core and approve cross-repo acme/platform-core for 20m",
    );
    expect(directiveMessage).toBeNull();

    const blockedMessage = await privateApi.getPermissionPolicyMessage(
      "check repository acme/platform-core README.md",
      { owner: "sourcegraph", repo: "shadowbox" },
    );
    expect(blockedMessage).toContain("approve cross-repo acme/platform-core");
  });

  it("forces platform approval gate when delegated harness mode is untrusted", async () => {
    const runEngine = createRunEngine({
      llmGateway: createPlanningLLMGateway(),
    });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "check repository acme/platform-core README.md",
        sessionId: "session-1",
        harnessMode: "delegated",
        repositoryContext: {
          owner: "sourcegraph",
          repo: "shadowbox",
        },
      },
      [
        {
          role: "user",
          content: "check repository acme/platform-core README.md",
        },
      ],
      {},
    );

    expect(response.status).toBe(200);
    const output = await response.text();

    const persisted = await (
      runEngine as unknown as {
        getRun(runId: string): Promise<Run | null>;
      }
    ).getRun(TEST_RUN_ID);

    const lifecycleSteps = persisted?.metadata.lifecycleSteps?.map(
      (entry) => entry.step,
    );

    expect(lifecycleSteps).toContain("APPROVAL_WAIT");
    expect(persisted?.metadata.manifest?.harnessMode).toBe("platform_owned");
    expect(output).toContain("approve cross-repo acme/platform-core");
    expect(persisted?.status).toBe("COMPLETED");
  });

  it("skips platform approval gate when delegated mode is internally authorized", async () => {
    const runEngine = createRunEngine({
      llmGateway: createPlanningLLMGateway(),
    });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "check repository acme/platform-core README.md",
        sessionId: "session-1",
        harnessMode: "delegated",
        metadata: {
          internal: { allowDelegatedHarnessMode: true },
        },
        repositoryContext: {
          owner: "sourcegraph",
          repo: "shadowbox",
        },
      },
      [
        {
          role: "user",
          content: "check repository acme/platform-core README.md",
        },
      ],
      {},
    );

    expect(response.status).toBe(200);

    const persisted = await (
      runEngine as unknown as {
        getRun(runId: string): Promise<Run | null>;
      }
    ).getRun(TEST_RUN_ID);

    const lifecycleSteps = persisted?.metadata.lifecycleSteps?.map(
      (entry) => entry.step,
    );

    expect(lifecycleSteps).not.toContain("APPROVAL_WAIT");
    expect(persisted?.metadata.manifest?.harnessMode).toBe("delegated");
    expect(persisted?.status).toBe("COMPLETED");
  });
});

function createRunEngine(
  dependencies: Partial<RunEngineDependencies> = {},
): RunEngine {
  return createRunEngineForRun({ dependencies });
}

function createRunEngineForRun({
  state = new MockRuntimeState(),
  runId = TEST_RUN_ID,
  sessionId = "session-1",
  dependencies = {},
}: {
  state?: RuntimeDurableObjectState;
  runId?: string;
  sessionId?: string;
  dependencies?: Partial<RunEngineDependencies>;
} = {}): RunEngine {
  const llmGateway = dependencies.llmGateway ?? createMockLLMGateway();
  return new RunEngine(
    state,
    {
      env: { NODE_ENV: "test" } as unknown,
      sessionId,
      runId,
    },
    undefined,
    undefined,
    { ...dependencies, llmGateway },
  );
}

function createMockLLMGateway(): ILLMGateway {
  return {
    generateText: async () => ({
      text: "ok",
      usage: {
        provider: "mock",
        model: "mock-model",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
    }),
    generateStructured: async () => ({
      object: { tasks: [], metadata: { estimatedSteps: 1 } },
      usage: {
        provider: "mock",
        model: "mock-model",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
    }),
    generateStream: async () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
  };
}

function createPlanningLLMGateway(): ILLMGateway {
  return {
    generateText: async () => ({
      text: "Execution complete",
      usage: {
        provider: "mock",
        model: "mock-model",
        promptTokens: 5,
        completionTokens: 5,
        totalTokens: 10,
      },
    }),
    generateStructured: async () => ({
      object: {
        tasks: [
          {
            id: "task-1",
            type: "shell",
            description: "Echo a deterministic marker",
            dependsOn: [],
            input: { command: "echo done" },
          },
        ],
        metadata: { estimatedSteps: 1 },
      },
      usage: {
        provider: "mock",
        model: "mock-model",
        promptTokens: 5,
        completionTokens: 5,
        totalTokens: 10,
      },
    }),
    generateStream: async () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
  };
}

class InMemoryStorage implements RuntimeStorage {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string | string[]): Promise<boolean | number> {
    if (Array.isArray(key)) {
      let deleted = 0;
      for (const entry of key) {
        if (this.store.delete(entry)) {
          deleted += 1;
        }
      }
      return deleted;
    }
    return this.store.delete(key);
  }

  async list<T>(options?: {
    prefix?: string;
    start?: string;
    end?: string;
    limit?: number;
  }): Promise<Map<string, T>> {
    const output = new Map<string, T>();
    const prefix = options?.prefix;
    const start = options?.start;
    const end = options?.end;
    const limit = options?.limit;

    for (const [key, value] of this.store.entries()) {
      if (prefix && !key.startsWith(prefix)) {
        continue;
      }
      if (start && key < start) {
        continue;
      }
      if (end && key >= end) {
        continue;
      }

      output.set(key, value as T);
      if (typeof limit === "number" && output.size >= limit) {
        break;
      }
    }

    return output;
  }
}

class MockRuntimeState implements RuntimeDurableObjectState {
  storage: RuntimeStorage = new InMemoryStorage();

  async blockConcurrencyWhile<T>(closure: () => Promise<T>): Promise<T> {
    return await closure();
  }
}
