import { CoreMessage, ToolResultPart } from 'ai';

/**
 * Prunes technical noise from tool results to keep context clean and high-signal.
 */
export function pruneToolResults(messages: CoreMessage[]): CoreMessage[] {
  return messages.map((message) => {
    if (message.role !== 'tool' || !Array.isArray(message.content)) return message;

    // In AI SDK 4.x, tool message content is ToolResultPart[]
    const content = message.content.map((part: ToolResultPart) => {
      let result = part.result;

      // 1. Prune list_files output
      if (part.toolName === 'list_files' && typeof result === 'string' && result.length > 500) {
        const fileCount = result.split('\n').filter(Boolean).length;
        result = `[Summary: ${fileCount} files/directories found. Output truncated to save context.]`;
      }

      // 2. Prune read_file output
      if (part.toolName === 'read_file' && typeof result === 'string' && result.length > 2000) {
        result = 
          result.substring(0, 1000) + 
          "\n\n... [CONTENT TRUNCATED FOR BREVITY] ...\n\n" + 
          result.substring(result.length - 1000);
      }

      // 3. Prune run_command output
      if (part.toolName === 'run_command' && typeof result === 'object' && result !== null) {
        const res = result as any;
        if (res.output && typeof res.output === 'string' && res.output.length > 1000) {
          res.output = 
            res.output.substring(0, 500) + 
            "\n... [STDOUT TRUNCATED] ...\n" + 
            res.output.substring(res.output.length - 500);
        }
      }

      return { ...part, result };
    });

    return { ...message, content };
  });
}
