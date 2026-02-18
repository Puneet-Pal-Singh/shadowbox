import { AgentResult, Tool } from "../../types/ai";

export class AnthropicProvider {
  constructor(
    public id: string,
    public name: string,
    private modelString: string
  ) {}

  async generate(messages: any[], tools: Tool[], apiKey: string): Promise<AgentResult> {
    if (!apiKey) throw new Error(`API Key missing for ${this.name}`);

    const systemMsg = messages.find(m => m.role === 'system')?.content || "";
    const userMsgs = messages.filter(m => m.role !== 'system');

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.modelString,
        max_tokens: 4096,
        system: systemMsg,
        messages: userMsgs,
        tools: tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters
        }))
      })
    });

    const data: any = await res.json();
    if (data.error) throw new Error(data.error.message);

    return {
      modelId: this.id,
      modelName: this.name,
      content: data.content.find((c: any) => c.type === 'text')?.text || "",
      toolCalls: data.content
        .filter((c: any) => c.type === 'tool_use')
        .map((c: any) => ({
          id: c.id,
          name: c.name,
          arguments: c.input
        }))
    };
  }
}