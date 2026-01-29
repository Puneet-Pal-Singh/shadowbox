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
      const body = await req.json() as { messages: CoreMessage[]; sessionId: string };
      const { messages, sessionId } = body;

      // 1. Google Gemini 2.5 Flash-Lite (The "Speed & Cost King")
      const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY || "";
      if (!apiKey) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
      
      const google = createGoogleGenerativeAI({ apiKey });

      // 2. Load Custom System Prompt from Env (or use Default)
      const systemPrompt = env.SYSTEM_PROMPT || `You are Shadowbox. Expert Engineer.
        - If asked to write code, YOU MUST use 'create_code_artifact'.
        - Act inside the sandbox. session: ${sessionId}
        - Be concise and action-oriented.`;

      // 3. Define Tools (Strictly Typed)
      const tools: Record<string, CoreTool> = {
        list_files: tool({
          description: 'List files in the directory',
          parameters: z.object({ path: z.string().default('.') }),
          execute: async ({ path }: { path: string }) => {
            const res = await env.SECURE_API.fetch(`http://internal/exec?session=${sessionId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ plugin: 'filesystem', action: 'list_files', path })
            });
            return await res.json();
          },
        }),

        read_file: tool({
          description: 'Read a file content',
          parameters: z.object({ path: z.string() }),
          execute: async ({ path }: { path: string }) => {
            const res = await env.SECURE_API.fetch(`http://internal/exec?session=${sessionId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ plugin: 'filesystem', action: 'read_file', path })
            });
            return await res.json();
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
                  action: 'write_file',
                  path,
                  content,
                }),
              });

              // Handle non-OK responses from the sandbox immediately
              if (!res.ok) {
                return { 
                  success: false, 
                  error: `Sandbox failed with status: ${res.status}` 
                };
              }

              const data = await res.json();
              
              // Return a clean, serializable object for the Vercel AI SDK
              return { 
                success: true, 
                path, 
                data 
              };
            } catch (error: unknown) {
              // CS Practice: Avoid 'any'. Use 'unknown' and narrow the error.
              const errorMessage = error instanceof Error ? error.message : "Failed to execute tool";
              console.error("Tool Execution Error:", errorMessage);
              
              return { 
                success: false, 
                error: errorMessage 
              };
            }
          },
        }),
      };

      // 4. Run the Agent Loop
      const result = await streamText({
        model: google('gemini-2.5-flash-lite'), // ✅ Updated to latest model
        messages: convertToCoreMessages(messages),
        system: systemPrompt,
        tools,
        maxSteps: 10,
      });

      // ✅ Correct way to send the stream with CORS
      return result.toDataStreamResponse({
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'text/plain; charset=utf-8', // Explicitly set for Cloudflare
        }
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