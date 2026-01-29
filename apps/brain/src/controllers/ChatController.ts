import { createOpenAI } from "@ai-sdk/openai";
import {
  streamText,
  tool,
  convertToCoreMessages,
  createDataStream,
  type CoreTool,
} from "ai";
import { z } from "zod";
import { Env } from "../types/ai";
import { CORS_HEADERS } from "../lib/cors";

interface ChatRequestBody {
  messages?: any[];
  sessionId?: string;
}

export class ChatController {
  static async handle(req: Request, env: Env): Promise<Response> {
    console.log("[Brain] ============================================");
    console.log("[Brain] Chat request received");
    console.log("[Brain] URL:", req.url);
    console.log("[Brain] Method:", req.method);
    
    try {
      // 1. Parse Request Body
      console.log("[Brain] Step 1: Parsing request body...");
      let body: ChatRequestBody;
      try {
        body = (await req.json().catch(() => ({}))) as ChatRequestBody;
        console.log("[Brain] Request body parsed:", JSON.stringify(body, null, 2));
      } catch (parseError) {
        console.error("[Brain] Failed to parse request body:", parseError);
        return new Response(
          JSON.stringify({ error: "Invalid JSON in request body" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      const { messages, sessionId } = body;
      console.log("[Brain] SessionId:", sessionId || "default");
      console.log("[Brain] Messages count:", messages?.length || 0);

      if (!messages || !Array.isArray(messages)) {
        console.error("[Brain] Invalid messages array:", messages);
        return new Response(
          JSON.stringify({ error: "Missing or invalid 'messages' array" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // 2. Setup Groq Provider
      console.log("[Brain] Step 2: Setting up Groq provider...");
      const groqApiKey = env.GROQ_API_KEY || "";
      console.log("[Brain] GROQ_API_KEY present:", groqApiKey ? "Yes" : "No");
      console.log("[Brain] GROQ_API_KEY length:", groqApiKey.length);
      
      if (!groqApiKey) {
        console.error("[Brain] GROQ_API_KEY is missing!");
        return new Response(
          JSON.stringify({ error: "Missing GROQ_API_KEY in environment" }),
          { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      let groq;
      try {
        groq = createOpenAI({
          baseURL: 'https://api.groq.com/openai/v1',
          apiKey: groqApiKey,
        });
        console.log("[Brain] Groq provider created successfully");
      } catch (providerError) {
        console.error("[Brain] Failed to create Groq provider:", providerError);
        return new Response(
          JSON.stringify({ error: "Failed to initialize AI provider" }),
          { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // 3. Load System Prompt
      console.log("[Brain] Step 3: Loading system prompt...");
      const systemPrompt =
        env.SYSTEM_PROMPT ||
        `You are Shadowbox, an expert software engineer.
        - Environment: Secure Linux Sandbox (Session: ${sessionId || "default"}).
        - Use 'create_code_artifact' to save your work.
        - Be extremely concise. No yapping.`;
      console.log("[Brain] System prompt loaded (length:", systemPrompt.length, ")");

      // 4. Define Tools
      console.log("[Brain] Step 4: Defining tools...");
      const tools: Record<string, CoreTool> = {
        list_files: tool({
          description: "List files in the directory",
          parameters: z.object({ 
            path: z.string().describe("Directory path").default(".") 
          }),
          execute: async ({ path }: { path: string }) => {
            console.log("[Brain] Tool: list_files called with path:", path);
            try {
              const res = await env.SECURE_API.fetch(
                `http://internal/exec?session=${sessionId}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    plugin: "filesystem",
                    payload: { action: "list_files", path },
                  }),
                },
              );
              const text = await res.text();
              console.log("[Brain] list_files response status:", res.status);
              if (!res.ok) {
                console.error("[Brain] list_files failed:", text);
                return { success: false, error: text };
              }
              return { success: true, data: text };
            } catch (error: unknown) {
              console.error("[Brain] list_files exception:", error);
              return { success: false, error: error instanceof Error ? error.message : "FS Error" };
            }
          },
        }),

        create_code_artifact: tool({
          description: "Write code to a file.",
          parameters: z.object({
            path: z.string(),
            content: z.string(),
            description: z.string().optional(),
          }),
          execute: async ({ path, content }: { path: string; content: string }) => {
            console.log("[Brain] Tool: create_code_artifact called for path:", path);
            try {
              const res = await env.SECURE_API.fetch(
                `http://internal/exec?session=${sessionId}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    plugin: "filesystem",
                    payload: { action: "write_file", path, content },
                  }),
                },
              );
              const text = await res.text();
              console.log("[Brain] create_code_artifact response status:", res.status);
              if (!res.ok) {
                console.error("[Brain] create_code_artifact failed:", text);
                return { success: false, error: text };
              }
              return { success: true, path, data: text };
            } catch (error: unknown) {
              console.error("[Brain] create_code_artifact exception:", error);
              return { success: false, error: error instanceof Error ? error.message : "Write Error" };
            }
          },
        }),
      };
      console.log("[Brain] Tools defined successfully");

      // 5. Convert Messages
      console.log("[Brain] Step 5: Converting messages...");
      let coreMessages;
      try {
        coreMessages = convertToCoreMessages(messages);
        console.log("[Brain] Messages converted successfully");
      } catch (convertError) {
        console.error("[Brain] Failed to convert messages:", convertError);
        return new Response(
          JSON.stringify({ error: "Failed to process messages" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // 6. Start Streaming
      console.log("[Brain] Step 6: Starting streamText with model llama-3.3-70b-versatile...");
      let result;
      try {
        result = await streamText({
          model: groq('llama-3.3-70b-versatile') as any,
          messages: coreMessages,
          system: systemPrompt,
          tools,
          maxSteps: 10,
        });
        console.log("[Brain] streamText initialized successfully");
      } catch (streamError) {
        console.error("[Brain] streamText failed:", streamError);
        
        const errorMessage = streamError instanceof Error 
          ? streamError.message 
          : "Unknown streaming error";
        
        return new Response(
          JSON.stringify({ error: errorMessage }),
          { 
            status: 500, 
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
          }
        );
      }

      // 7. Return Stream Response
      console.log("[Brain] Step 7: Returning data stream response...");
      try {
        const response = result.toDataStreamResponse({
          headers: CORS_HEADERS,
        });
        console.log("[Brain] Response created successfully");
        console.log("[Brain] ============================================");
        return response;
      } catch (responseError) {
        console.error("[Brain] Failed to create response:", responseError);
        return new Response(
          JSON.stringify({ error: "Failed to create stream response" }),
          { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

    } catch (unexpectedError) {
      console.error("[Brain] UNEXPECTED ERROR:", unexpectedError);
      console.error("[Brain] Error type:", typeof unexpectedError);
      console.error("[Brain] Error details:", unexpectedError instanceof Error ? unexpectedError.stack : String(unexpectedError));
      
      return new Response(
        JSON.stringify({ 
          error: "Unexpected server error",
          details: unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError)
        }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
  }
}
