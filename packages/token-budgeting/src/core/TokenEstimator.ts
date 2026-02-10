/**
 * TokenEstimator - Deterministic token counting
 *
 * Single responsibility: Estimate tokens in text using character-based approximation
 * No randomness, no model calls, deterministic output
 */

/**
 * Estimate tokens using character-based approximation
 */
export class TokenEstimator {
  private readonly charsPerToken: number;

  /**
   * Create token estimator with character-to-token ratio
   * @param charsPerToken - Average characters per token (default: 4)
   * @throws Error if charsPerToken is not positive
   */
  constructor(charsPerToken: number = 4) {
    if (charsPerToken <= 0 || !Number.isFinite(charsPerToken)) {
      throw new Error(
        `charsPerToken must be a positive number, received: ${charsPerToken}`,
      );
    }
    this.charsPerToken = charsPerToken;
  }

  /**
   * Estimate tokens in a string
   * @param text - Text to estimate
   * @returns Estimated token count
   */
  estimate(text: string): number {
    return Math.ceil(text.length / this.charsPerToken);
  }

  /**
   * Estimate tokens in multiple strings (sum)
   * @param texts - Array of texts
   * @returns Total estimated tokens
   */
  estimateBatch(texts: string[]): number {
    return texts.reduce((total, text) => total + this.estimate(text), 0);
  }

  /**
   * Estimate tokens with metadata (for reporting)
   * @param text - Text to estimate
   * @param label - Optional human-readable label
   * @returns Estimation result with metadata
   */
  estimateWithMetadata(
    text: string,
    label?: string,
  ): { tokens: number; bytes: number; label?: string } {
    return {
      tokens: this.estimate(text),
      bytes: new Blob([text]).size,
      label,
    };
  }

  /**
   * Truncate text to fit within token budget
   * @param text - Text to truncate
   * @param maxTokens - Maximum tokens allowed
   * @returns Truncated text that fits within budget
   */
  truncateToTokens(text: string, maxTokens: number): string {
    if (maxTokens <= 0) {
      return "";
    }

    const maxChars = maxTokens * this.charsPerToken;
    if (text.length <= maxChars) {
      return text;
    }

    // Truncate with safety margin to ensure we stay under limit
    return text.substring(0, Math.floor(maxChars * 0.95)) + "...";
  }
}
