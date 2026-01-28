// apps/brain/src/orchestrator/executor.ts
import { Env, ToolCall, ChatMessage } from "../types/ai";
import { AIService } from "../services/AIService";
import { DiscoveryService } from "../services/DiscoveryService";

export class AgentOrchestrator {
  private MAX_TURNS = 5;

  constructor(private env: Env, private sessionId: string) {}

  /**
   * The core autonomous loop. 
   * Think -> Act -> Observe -> Repeat
   */
  async orchestrate(
    messages: ChatMessage[], 
    modelId: string, 
    apiKey?: string
  ): Promise<ChatMessage[]> {
    let currentHistory = [...messages];
    let turns = 0;

    // 1. Fetch available tools dynamically from the Muscle
    const tools = await DiscoveryService.getAvailableTools(this.env, this.sessionId);

    while (turns < this.MAX_TURNS) {
      // 2. Ask the LLM what to do
      const aiResponse = await AIService.getCompletion(
        this.env, 
        modelId, 
        currentHistory, 
        tools, 
        apiKey
      );

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: aiResponse.content || "",
        tool_calls: aiResponse.toolCalls
      };

      currentHistory.push(assistantMsg);

      // 3. Exit condition: No tool calls mean the agent is done
      if (!aiResponse.toolCalls || aiResponse.toolCalls.length === 0) {
        break;
      }

      // 4. Execute all tool calls in parallel
      const toolResults = await Promise.all(
        aiResponse.toolCalls.map(async (call) => {
          const result = await this.executeTool(call);
          return {
            role: 'tool' as const,
            tool_call_id: call.id,
            name: call.name,
            content: typeof result === 'string' ? result : JSON.stringify(result)
          };
        })
      );

      // 5. Add results to history and increment turn
      currentHistory.push(...toolResults);
      turns++;
    }

    return currentHistory;
  }

  async executeTool(call: ToolCall): Promise<any> {
    const mapping = this.mapToolToPlugin(call.name, call.arguments);
    if (!mapping) return { error: `Tool ${call.name} not mapped` };

    try {
      const res = await this.env.SECURE_API.fetch(`http://internal/?session=${this.sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          plugin: mapping.plugin, 
          payload: mapping.payload 
        })
      });
      return await res.json();
    } catch (e: any) {
      return { error: e.message };
    }
  }

  private mapToolToPlugin(toolName: string, args: any) {
    const registry: Record<string, { plugin: string, action: string }> = {
      'list_files': { plugin: 'filesystem', action: 'list_files' },
      'read_file': { plugin: 'filesystem', action: 'read_file' },
      'write_file': { plugin: 'filesystem', action: 'write_file' },
      'make_dir': { plugin: 'filesystem', action: 'make_dir' },
      'git_clone': { plugin: 'git', action: 'clone' },
      'run_node': { plugin: 'node', action: 'run' },
      'run_python': { plugin: 'python', action: 'run' }
    };

    const target = registry[toolName];
    if (!target) return null;

    return {
      plugin: target.plugin,
      payload: { action: target.action, ...args }
    };
  }
}