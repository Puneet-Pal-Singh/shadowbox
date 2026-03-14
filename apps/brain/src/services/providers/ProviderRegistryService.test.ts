import { describe, expect, it } from "vitest";
import { ProviderRegistryService } from "./ProviderRegistryService";

describe("ProviderRegistryService execution profiles", () => {
  const service = new ProviderRegistryService();

  it("keeps the default Axis free model out of action and structured lanes", () => {
    const profile = service.getExecutionProfile(
      "axis",
      "z-ai/glm-4.5-air:free",
    );

    expect(profile).toMatchObject({
      latencyTier: "slow",
      reliabilityTier: "experimental",
      supportedLanes: {
        chat_only: { supported: true },
        single_agent_action: { supported: false },
        structured_planning_required: { supported: false },
      },
    });
  });

  it("allows explicitly approved Axis action models without opening structured planning", () => {
    const profile = service.getExecutionProfile(
      "axis",
      "arcee-ai/trinity-large-preview:free",
    );

    expect(profile).toMatchObject({
      supportedLanes: {
        chat_only: { supported: true },
        single_agent_action: { supported: true },
        structured_planning_required: { supported: false },
      },
    });
  });

  it("keeps OpenRouter free models out of structured planning", () => {
    const profile = service.getExecutionProfile(
      "openrouter",
      "meta-llama/llama-3.3-70b-instruct:free",
    );

    expect(profile?.supportedLanes.structured_planning_required).toMatchObject({
      supported: false,
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
});
