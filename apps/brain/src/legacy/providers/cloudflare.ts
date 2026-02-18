import { Env, AgentResult, Tool } from "../../types/ai";

export class CloudflareProvider {
  constructor(private env: Env) {}

  async generate(messages: any[], tools: Tool[]): Promise<AgentResult> {
    // Note: Llama-3-8b on Cloudflare now supports "Tool Use" natively in the latest versions!
    // But for simplicity/stability, we use the standard chat run first.
    const response = await this.env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages,
      // @ts-ignore - Some newer models support this but types lag behind
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    });

    // @ts-ignore - The response shape depends on the model
    return { content: response.response || "" };
  }
}