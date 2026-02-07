export class SystemPromptService {
  generatePrompt(runId: string, systemPrompt?: string, customPrompt?: string): string {
    // 1. Highest priority: Custom prompt from request (rare)
    if (customPrompt) {
      return customPrompt;
    }

    // 2. Environment variable from Cloudflare (.dev.vars)
    if (systemPrompt) {
       return systemPrompt.replace('${runId}', runId);
    }

    // 3. Fallback: Ultra-minimal default
    return `You are Shadowbox. Workspace: /home/sandbox/workspaces/${runId}. Be concise.`;
  }
}
