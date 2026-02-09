/**
 * TokenCounter - Simple character-based token estimation
 *
 * Single responsibility: Count tokens in strings
 *
 * Algorithm: 4 characters ≈ 1 token (simple approximation)
 * No side effects, pure function
 */
export class TokenCounter {
  private readonly charsPerToken: number;

  constructor(charsPerToken = 4) {
    this.charsPerToken = charsPerToken;
  }

  /**
   * Count tokens in a string
   * @param text - Input text
   * @returns Estimated token count
   */
  count(text: string): number {
    return Math.ceil(text.length / this.charsPerToken);
  }

  /**
   * Count tokens in multiple strings
   * @param texts - Array of strings
   * @returns Total estimated token count
   */
  countBatch(texts: string[]): number {
    return texts.reduce((total, text) => total + this.count(text), 0);
  }
}
