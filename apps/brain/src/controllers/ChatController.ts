// apps/brain/src/controllers/ChatController.ts
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { 
  streamText, 
  tool, 
  convertToCoreMessages, 
  type CoreMessage, 
  type CoreTool 
} from 'ai';
import { z } from 'zod';
import { Env } from '../types/ai';
import { CORS_HEADERS } from "../lib/cors";

export class ChatController {
  static async handle(req: Request, env: Env): Promise<Response> {
    try {
      // 1. Robust Body Parsing
      const body = await req.json().catch(() => ({})) as { messages?: any[]; sessionId?: string };
      const { messages, sessionId } = body;

      if (!messages || !Array.isArray(messages)) {
        return new Response(JSON.stringify({ error: "Missing or invalid 'messages' array" }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      // 2. Google Gemini 1.5 Flash (Reliable & Fast)
      const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY || "";
      if (!apiKey) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
      
      const google = createGoogleGenerativeAI({ apiKey });

      // 3. Load Custom System Prompt from Env (or use Default)
      const systemPrompt = env.SYSTEM_PROMPT || `You are Shadowbox, an expert software engineer.
        - Act inside the secure sandbox session: ${sessionId || 'default'}.
        - If asked to write code, ALWAYS use 'create_code_artifact'.
        - After using any tool, ALWAYS provide a concise summary of the result and ask the user for the next step.
        - Be proactive but keep your responses concise and action-oriented.`;

      // 4. Define Tools (Strictly Typed)
      const tools: Record<string, CoreTool> = {
        list_files: tool({
          description: 'List files in the directory',
          parameters: z.object({ path: z.string().default('.') }),
          execute: async ({ path }: { path: string }) => {
            try {
              const res = await env.SECURE_API.fetch(`http://internal/exec?session=${sessionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  plugin: 'filesystem', 
                  payload: { action: 'list_files', path } 
                })
              });
              
              const text = await res.text();
              if (!res.ok) return { success: false, error: `Sandbox Error (${res.status}): ${text}` };
              
              try {
                return { success: true, data: JSON.parse(text) };
              } catch {
                return { success: true, data: text };
              }
            } catch (e: any) {
              return { success: false, error: e.message };
            }
          },
        }),

        read_file: tool({
          description: 'Read a file content',
          parameters: z.object({ path: z.string() }),
          execute: async ({ path }: { path: string }) => {
            try {
              const res = await env.SECURE_API.fetch(`http://internal/exec?session=${sessionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  plugin: 'filesystem', 
                  payload: { action: 'read_file', path } 
                })
              });
              
              const text = await res.text();
              if (!res.ok) return { success: false, error: `Sandbox Error (${res.status}): ${text}` };
              
              try {
                return { success: true, data: JSON.parse(text) };
              } catch {
                return { success: true, data: text };
              }
            } catch (e: any) {
              return { success: false, error: e.message };
            }
          },
        }),

        create_code_artifact: tool({
          description: 'Write code to a file. This opens the side-pane editor for the user.',
          parameters: z.object({
            path: z.string(),
            content: z.string(),
            description: z.string().optional(),
          }),
          execute: async ({ path, content }: { path: string; content: string; description?: string }) => {
            try {
              const res = await env.SECURE_API.fetch(`http://internal/exec?session=${sessionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  plugin: 'filesystem',
                  payload: {
                    action: 'write_file',
                    path,
                    content,
                  }
                }),
              });

              const text = await res.text();
              if (!res.ok) return { success: false, error: `Sandbox Error (${res.status}): ${text}` };
              
              try {
                return { success: true, path, data: JSON.parse(text) };
              } catch {
                return { success: true, path, data: text };
              }
            } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : "Failed to execute tool";
              return { success: false, error: errorMessage };
            }
          },
        }),
      };

      // 5. Run the Agent Loop
      const result = await streamText({
        model: google('gemini-2.0-flash-exp'), // Upgraded to 2.0 Flash
        messages: convertToCoreMessages(messages),
        system: systemPrompt,
        tools,
        maxSteps: 10,
      });

      // ✅ Correct way to send the stream with CORS
      return result.toDataStreamResponse({
        headers: CORS_HEADERS
      });

    } catch (error: unknown) {
      console.error("Brain Error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), { 
        status: 500,
        headers: { 
          ...CORS_HEADERS,
          'Content-Type': 'application/json' 
        }
      });
    }
  }
}