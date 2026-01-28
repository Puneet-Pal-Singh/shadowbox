// apps/brain/src/controllers/ChatController.ts
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

      // inside the handle function
      const systemPrompt = `You are Shadowbox Agent. You live INSIDE a Linux Sandbox.
        You are NOT a text-based AI; you are a SYSTEM OPERATOR.

        AVAILABLE TOOLS:
        1. 'list_files': Use this whenever the user mentions files or current directory.
        2. 'write_file': Use this to save code.
        3. 'git_clone': Use this to download repos.

        RULES:
        - If a user asks "What files are here?", you MUST call 'list_files'.
        - Never say "I don't have access to files." You DO have access via tools.
        - Execute the tool first, then explain what you did.`;

      // 2. Think
      // const aiResponse = await AIService.getCompletion(env, modelId, messages, tools, apiKey);
      const aiResponse = await AIService.getCompletion(env, modelId, [
        { role: 'system', content: systemPrompt },
        ...messages
        ], tools, apiKey);

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