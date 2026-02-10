/**
 * ImportanceScorer - Heuristic importance scoring
 *
 * Single responsibility: Assign importance scores based on file characteristics
 * No side effects, pure function
 */
import type { RepoFileMeta, FileKind } from "../types.js";
import { FileKind as FileKindEnum } from "../types.js";
import { FileClassifier } from "../scanner/FileClassifier.js";

interface ScoringSignals {
  isRootLevel: boolean;
  isEntryPoint: boolean;
  isConfig: boolean;
  isTest: boolean;
  isGenerated: boolean;
  isVendor: boolean;
  isLarge: boolean;
  isTiny: boolean;
}

const GENERATED_PATTERNS = [/\b(build|dist|\.next|\.out)\b/, /generated/i];
const VENDOR_PATTERNS = [/\b(node_modules|vendor)\b/, /\.min\./];

/**
 * Calculate importance score for a file
 */
export class ImportanceScorer {
  private static readonly BASE_SCORE = 0.5;
  private static readonly BOOST_INCREMENT = 0.2;
  private static readonly REDUCE_INCREMENT = 0.2;
  private static readonly LOC_THRESHOLD_LARGE = 500; // Lines of code threshold for large files
  private static readonly LOC_THRESHOLD_TINY = 50; // Lines of code threshold for tiny files

  /**
   * Score a file's importance (0-1)
   */
  static score(file: RepoFileMeta): number {
    let score = this.BASE_SCORE;
    const signals = this.getSignals(file);

    // Apply boost signals
    if (signals.isRootLevel) {
      score += this.BOOST_INCREMENT;
    }
    if (signals.isEntryPoint) {
      score += this.BOOST_INCREMENT;
    }
    if (signals.isConfig) {
      score += this.BOOST_INCREMENT;
    }
    if (signals.isLarge) {
      score += this.BOOST_INCREMENT;
    }

    // Apply reduce signals
    if (signals.isTest) {
      score -= this.REDUCE_INCREMENT;
    }
    if (signals.isGenerated) {
      score -= this.REDUCE_INCREMENT;
    }
    if (signals.isVendor) {
      score -= this.REDUCE_INCREMENT;
    }
    if (signals.isTiny) {
      score -= this.REDUCE_INCREMENT;
    }

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Extract scoring signals from file
   */
  private static getSignals(file: RepoFileMeta): ScoringSignals {
    const pathParts = file.path.split("/");
    const depth = pathParts.length;

    return {
      isRootLevel: depth <= 2,
      isEntryPoint: FileClassifier.isEntryPoint(file.path),
      isConfig: file.kind === FileKindEnum.CONFIG,
      isTest: file.kind === FileKindEnum.TEST,
      isGenerated: this.isGenerated(file.path),
      isVendor: this.isVendor(file.path),
      isLarge: (file.loc ?? 0) > this.LOC_THRESHOLD_LARGE,
      isTiny: file.size < this.LOC_THRESHOLD_TINY,
    };
  }

  /**
   * Check if path indicates generated file
   */
  private static isGenerated(path: string): boolean {
    return GENERATED_PATTERNS.some((pattern) => pattern.test(path));
  }

  /**
   * Check if path indicates vendor/external code
   */
  private static isVendor(path: string): boolean {
    return VENDOR_PATTERNS.some((pattern) => pattern.test(path));
  }
}
