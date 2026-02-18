import { AgentResult, Tool } from "../types/ai";

export class OpenAIProvider {
  constructor(
    public id: string,
    public name: string,
    private modelString: string
  ) {}

  async generate(messages: any[], tools: Tool[], apiKey: string): Promise<AgentResult> {
    if (!apiKey) throw new Error(`API Key missing for ${this.name}`);

    // 1. Map Shadowbox Tools to OpenAI Tool Format
    const openAiTools = tools.map(t => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    // 2. Call OpenAI API
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.modelString,
        messages: messages,
        tools: openAiTools,
        tool_choice: "auto" // Let the model decide whether to use tools
      })
    });

    const data: any = await res.json();

    if (data.error) {
      throw new Error(`OpenAI Error: ${data.error.message}`);
    }

    const choice = data.choices[0];
    const message = choice.message;

    // 3. Parse Tool Calls
    const toolCalls = message.tool_calls?.map((t: any) => ({
      id: t.id,
      name: t.function.name,
      arguments: JSON.parse(t.function.arguments)
    })) || [];

    return {
      modelId: this.id,
      modelName: this.name,
      content: message.content || "", // Content can be null if tool_calls exist
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }
}