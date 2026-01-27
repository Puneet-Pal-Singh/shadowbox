import { Env } from "../types/ai";
import { DiscoveryService } from "../services/DiscoveryService";
import { AIService } from "../services/AIService";
import { ExecutionService } from "../services/ExecutionService";

export class ChatController {
  static async handle(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
    try {
      const { messages, modelId, apiKey, sessionId } = await request.json() as any;

      // 1. Discover capabilities
      const tools = await DiscoveryService.getAvailableTools(env, sessionId);

      // 2. Think
      const aiResponse = await AIService.getCompletion(env, modelId, messages, tools, apiKey);

      // 3. Act (Execute tool calls if they exist)
      let toolResults;
      if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
        toolResults = await ExecutionService.runToolCalls(env, sessionId, aiResponse.toolCalls);
      }

      // 4. Respond
      return Response.json({
        ...aiResponse,
        toolResults
      }, { headers: corsHeaders });

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Internal Controller Error";
      return Response.json({ error: msg }, { status: 500, headers: corsHeaders });
    }
  }
}