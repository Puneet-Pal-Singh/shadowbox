import { Env, Tool, AgentResult } from "../types/ai";
import { MODEL_REGISTRY } from "../registry";

export class AIService {
  static async getCompletion(
    env: Env,
    modelId: string,
    messages: Array<{ role: string; content: string }>,
    tools: Tool[],
    apiKey?: string
  ): Promise<AgentResult> {
    const modelKey = modelId as keyof typeof MODEL_REGISTRY;
    const providerFactory = MODEL_REGISTRY[modelKey] || MODEL_REGISTRY["claude-4.5-sonnet"];
    
    const provider = providerFactory(modelId, env);
    
    return await provider.generate(messages, tools, apiKey || "");
  }
}