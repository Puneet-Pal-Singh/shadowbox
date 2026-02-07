export class SystemPromptService {
  generatePrompt(runId: string, systemPrompt?: string, customPrompt?: string): string {
    // 1. Highest priority: Custom prompt from request (rare)
    if (customPrompt) {
      return customPrompt;
    }

    // 2. Environment variable from Cloudflare
    if (systemPrompt) {
       return systemPrompt.replace('${runId}', runId);
    }

    // 3. Fallback: Hardcoded default if everything else fails
    return `You are Shadowbox, an autonomous expert software engineer.
WORKSPACE: /home/sandbox/workspaces/${runId}
Be concise.`;
  }
}
