import { describe, expect, it, vi } from "vitest";
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
import { Run } from "../run/index.js";
import { CodingAgent } from "../agents/CodingAgent.js";

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

  it("uses model-selected chat mode for greeting prompts", async () => {
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
    expect(await response.text()).toBe("ok");
    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(generateText).toHaveBeenCalledTimes(1);
    const modeRequest = generateStructured.mock.calls[0]?.[0] as {
      context?: { phase?: string };
    };
    expect(modeRequest.context?.phase).toBe("planning");
  });

  it("returns a user-facing recovery message when structured planning output is invalid", async () => {
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
        .mockResolvedValueOnce({
          object: { mode: "action", rationale: "needs tools" },
          usage: {
            provider: "mock",
            model: "mock-model",
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: 2,
          },
        })
        .mockRejectedValueOnce(
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
      }
    ).getRun(TEST_RUN_ID);
    expect(persisted?.status).toBe("COMPLETED");
    expect(persisted?.metadata.error).toContain(
      "Planner response did not match required schema",
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
        getById(runId: string): Promise<Run | null>;
      };
      handleExecutionError(runId: string, error: unknown): Promise<void>;
    };

    const run = new Run("run-created", "session-1", "CREATED", "coding", {
      agentType: "coding",
      prompt: "check repo",
      sessionId: "session-1",
    });
    await privateApi.runRepo.create(run);

    await privateApi.handleExecutionError("run-created", new Error("boom"));

    const persisted = await privateApi.runRepo.getById("run-created");
    expect(persisted?.status).toBe("FAILED");
    expect(persisted?.metadata.error).toBe("boom");
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

  it("records immutable selection snapshots across planning, execution, and synthesis metadata", async () => {
    const runEngine = createRunEngine({
      llmGateway: createPlanningLLMGateway(),
    });

    const response = await runEngine.execute(
      {
        agentType: "coding",
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
    expect(snapshots?.execution).toEqual(manifest);
    expect(snapshots?.synthesis).toEqual(manifest);
    expect(snapshots?.planning).not.toBe(manifest);
    expect(lifecycleSteps).toEqual([
      "RUN_CREATED",
      "CONTEXT_PREPARED",
      "PLAN_VALIDATED",
      "TASK_EXECUTING",
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
