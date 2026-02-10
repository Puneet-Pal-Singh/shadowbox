/**
 * TokenCounter - Simple character-based token estimation
 *
 * Single responsibility: Count tokens in strings using character-based estimation
 *
 * Algorithm: 4 characters ≈ 1 token (simple approximation)
 * No side effects, pure function
 */
export class TokenCounter {
  private readonly charsPerToken: number;

  /**
   * Create token counter with custom character-to-token ratio
   * @param charsPerToken - Number of characters per token (default: 4)
   * @throws Error if charsPerToken is not a positive number
   */
  constructor(charsPerToken = 4) {
    if (charsPerToken <= 0 || !Number.isFinite(charsPerToken)) {
      throw new Error(
        `charsPerToken must be a positive number, received: ${charsPerToken}`,
      );
    }
    this.charsPerToken = charsPerToken;
  }

  /**
   * Count tokens in a string
   * @param text - Input text
   * @returns Estimated token count using character-based estimation
   */
  count(text: string): number {
    return Math.ceil(text.length / this.charsPerToken);
  }

  /**
   * Count tokens in multiple strings
   * @param texts - Array of strings
   * @returns Total estimated token count for all strings
   */
  countBatch(texts: string[]): number {
    return texts.reduce((total, text) => total + this.count(text), 0);
  }
}
