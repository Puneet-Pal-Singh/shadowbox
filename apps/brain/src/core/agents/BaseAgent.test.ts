// apps/brain/src/core/agents/BaseAgent.test.ts

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentRegistry, AgentNotFoundError } from "./AgentRegistry";
import { CodingAgent } from "./CodingAgent";
import { ReviewAgent } from "./ReviewAgent";
import type { ExecutionService } from "../../services/ExecutionService";
import type { Plan } from "../planner";
import { Run } from "../run";
import type { ILLMGateway } from "../llm";

const createMockLLMGateway = () =>
  ({
    generateStructured: vi.fn(),
    generateText: vi.fn(),
  }) as unknown as ILLMGateway;

const createMockExecutionService = () =>
  ({
    execute: vi.fn(),
  }) as unknown as ExecutionService;

const createTestRun = (): Run =>
  new Run("run-1", "session-1", "CREATED", "coding", {
    agentType: "coding",
    prompt: "Fix the bug",
    sessionId: "session-1",
  });

const createMockPlan = (): Plan => ({
  tasks: [
    {
      id: "1",
      type: "analyze",
      description: "Read the file",
      dependsOn: [],
    },
  ],
  metadata: { estimatedSteps: 1 },
});

describe("AgentRegistry", () => {
  let registry: AgentRegistry;
  let mockGateway: ILLMGateway;
  let mockExec: ExecutionService;

  beforeEach(() => {
    registry = new AgentRegistry();
    mockGateway = createMockLLMGateway();
    mockExec = createMockExecutionService();
  });

  it("should register and retrieve an agent", () => {
    const agent = new CodingAgent(mockGateway, mockExec);
    registry.register(agent);

    expect(registry.get("coding")).toBe(agent);
  });

  it("should report has() correctly", () => {
    const agent = new CodingAgent(mockGateway, mockExec);
    registry.register(agent);

    expect(registry.has("coding")).toBe(true);
    expect(registry.has("review")).toBe(false);
  });

  it("should return available types", () => {
    registry.register(new CodingAgent(mockGateway, mockExec));
    registry.register(new ReviewAgent(mockGateway, mockExec));

    const types = registry.getAvailableTypes();
    expect(types).toContain("coding");
    expect(types).toContain("review");
    expect(types).toHaveLength(2);
  });

  it("should throw AgentNotFoundError for unknown type", () => {
    expect(() => registry.get("unknown-type")).toThrow(AgentNotFoundError);
  });
});

describe("CodingAgent", () => {
  let agent: CodingAgent;
  let mockGateway: ILLMGateway;
  let mockExec: ExecutionService;

  beforeEach(() => {
    mockGateway = createMockLLMGateway();
    mockExec = createMockExecutionService();
    agent = new CodingAgent(mockGateway, mockExec);
  });

  it("should return coding capabilities", () => {
    const caps = agent.getCapabilities();
    const names = caps.map((c) => c.name);

    expect(names).toContain("file_read");
    expect(names).toContain("file_edit");
    expect(names).toContain("git_commit");
    expect(names).toContain("test_run");
    expect(names).toContain("shell_execute");
    expect(caps).toHaveLength(5);
  });

  it("should have type 'coding'", () => {
    expect(agent.type).toBe("coding");
  });

  it("should generate a valid plan via gateway", async () => {
    const mockPlan = createMockPlan();
    (mockGateway.generateStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
      object: mockPlan,
      usage: {
        provider: "litellm",
        model: "test-model",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
    });

    const run = createTestRun();
    const plan = await agent.plan({ run, prompt: "Fix the bug" });

    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0].type).toBe("analyze");
    expect(mockGateway.generateStructured).toHaveBeenCalledOnce();
  });
});

describe("ReviewAgent", () => {
  let agent: ReviewAgent;
  let mockGateway: ILLMGateway;
  let mockExec: ExecutionService;

  beforeEach(() => {
    mockGateway = createMockLLMGateway();
    mockExec = createMockExecutionService();
    agent = new ReviewAgent(mockGateway, mockExec);
  });

  it("should return review capabilities", () => {
    const caps = agent.getCapabilities();
    const names = caps.map((c) => c.name);

    expect(names).toContain("file_read");
    expect(names).toContain("code_review");
    expect(names).toContain("suggest_fixes");
    expect(caps).toHaveLength(3);
  });

  it("should have type 'review'", () => {
    expect(agent.type).toBe("review");
  });

  it("should generate a valid plan via gateway", async () => {
    const mockPlan = createMockPlan();
    (mockGateway.generateStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
      object: mockPlan,
      usage: {
        provider: "litellm",
        model: "test-model",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
    });

    const run = createTestRun();
    const plan = await agent.plan({ run, prompt: "Review the code" });

    expect(plan.tasks).toHaveLength(1);
    expect(mockGateway.generateStructured).toHaveBeenCalledOnce();
  });
});
