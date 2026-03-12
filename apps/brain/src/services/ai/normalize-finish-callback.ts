import { type GenerateTextResult } from "./TextGenerationService";

export function normalizeFinishCallback(
  providerId: string | undefined,
  onFinish: ((result: GenerateTextResult) => Promise<void> | void) | undefined,
): ((result: GenerateTextResult) => Promise<void>) | undefined {
  if (!onFinish) {
    return undefined;
  }

  return async (result: GenerateTextResult) => {
    if (providerId && result.usage.provider !== providerId) {
      await onFinish({
        ...result,
        usage: {
          ...result.usage,
          provider: providerId,
        },
      });
      return;
    }
    await onFinish(result);
  };
}
