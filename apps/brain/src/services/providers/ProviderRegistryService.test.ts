import { describe, expect, it } from "vitest";
import { ProviderRegistryService } from "./ProviderRegistryService";

describe("ProviderRegistryService execution profiles", () => {
  const service = new ProviderRegistryService();

  it("admits Axis free models to action and structured lanes when capabilities qualify", () => {
    const profile = service.getExecutionProfile(
      "axis",
      "z-ai/glm-4.5-air:free",
    );

    expect(profile).toMatchObject({
      latencyTier: "slow",
      reliabilityTier: "experimental",
      supportedLanes: {
        chat_only: { supported: true },
        single_agent_action: { supported: true },
        structured_planning_required: { supported: true },
      },
    });
  });

  it("admits Axis approved action models to all capability-qualifying lanes", () => {
    const profile = service.getExecutionProfile(
      "axis",
      "arcee-ai/trinity-large-preview:free",
    );

    expect(profile).toMatchObject({
      supportedLanes: {
        chat_only: { supported: true },
        single_agent_action: { supported: true },
        structured_planning_required: { supported: true },
      },
    });
  });

  it("admits OpenRouter free models to structured planning when capabilities qualify", () => {
    const profile = service.getExecutionProfile(
      "openrouter",
      "meta-llama/llama-3.3-70b-instruct:free",
    );

    expect(profile?.supportedLanes.structured_planning_required).toMatchObject({
      supported: true,
    });
  });

  it("keeps OpenAI defaults eligible for structured planning", () => {
    const profile = service.getExecutionProfile("openai", "gpt-4o");

    expect(profile).toMatchObject({
      latencyTier: "standard",
      reliabilityTier: "hardened",
      supportedLanes: {
        chat_only: { supported: true },
        single_agent_action: { supported: true },
        structured_planning_required: { supported: true },
      },
    });
  });

  it("blocks action lane when provider lacks tool-calling support", () => {
    const noToolsService = new ProviderRegistryService([
      {
        providerId: "no-tools",
        name: "No Tools Provider",
        adapterFamily: "openai-compatible",
        capabilities: {
          streaming: true,
          tools: false,
          structuredOutputs: false,
          jsonMode: false,
        },
      },
    ]);

    const profile = noToolsService.getExecutionProfile(
      "no-tools",
      "some-model",
    );

    expect(profile?.supportedLanes.single_agent_action).toMatchObject({
      supported: false,
      reason: "Selected provider does not support tool calling.",
    });
  });

  it("blocks structured planning when provider lacks structured output support", () => {
    const noStructuredService = new ProviderRegistryService([
      {
        providerId: "no-structured",
        name: "No Structured Provider",
        adapterFamily: "openai-compatible",
        capabilities: {
          streaming: true,
          tools: true,
          structuredOutputs: false,
          jsonMode: true,
        },
      },
    ]);

    const profile = noStructuredService.getExecutionProfile(
      "no-structured",
      "some-model",
    );

    expect(
      profile?.supportedLanes.structured_planning_required,
    ).toMatchObject({
      supported: false,
      reason: "Structured planning requires structured output support.",
    });
  });
});
