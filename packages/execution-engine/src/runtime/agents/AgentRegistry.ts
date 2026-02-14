// apps/brain/src/core/agents/AgentRegistry.ts
// Phase 3D: Registry for looking up agents by type

import type { AgentType, IAgent, IAgentRegistry } from "../types.js";

export class AgentRegistry implements IAgentRegistry {
  private agents: Map<string, IAgent> = new Map();

  register(agent: IAgent): void {
    if (this.agents.has(agent.type)) {
      console.warn(
        `[agents/registry] Overwriting existing agent for type: ${agent.type}`,
      );
    }
    console.log(`[agents/registry] Registered agent: ${agent.type}`);
    this.agents.set(agent.type, agent);
  }

  get(type: AgentType): IAgent {
    const agent = this.agents.get(type);
    if (!agent) {
      throw new AgentNotFoundError(type);
    }
    return agent;
  }

  has(type: AgentType): boolean {
    return this.agents.has(type);
  }

  getAvailableTypes(): AgentType[] {
    return Array.from(this.agents.keys());
  }
}

export class AgentNotFoundError extends Error {
  constructor(type: string) {
    super(`[agents/registry] Agent not found for type: ${type}`);
    this.name = "AgentNotFoundError";
  }
}
