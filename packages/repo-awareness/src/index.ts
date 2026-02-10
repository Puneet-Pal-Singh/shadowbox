/**
 * Repo Awareness - Public API
 *
 * Lightweight repository structure scanning without loading file contents
 */

export { RepoScanner } from "./scanner/RepoScanner.js";
export { PathMatcher } from "./scanner/PathMatcher.js";
export { FileClassifier } from "./scanner/FileClassifier.js";
export { ImportanceScorer } from "./analyzer/ImportanceScorer.js";
export { RepoIndexBuilder } from "./analyzer/RepoIndexBuilder.js";
export { RepoSummaryFormatter } from "./formatter/RepoSummaryFormatter.js";

export type {
  RepoFileMeta,
  RepoSummary,
  ScanOptions,
} from "./types.js";
export { FileKind } from "./types.js";

import { RepoScanner } from "./scanner/RepoScanner.js";
import { RepoIndexBuilder } from "./analyzer/RepoIndexBuilder.js";
import type { ScanOptions, RepoSummary } from "./types.js";

/**
 * Convenience function: scan repo and get summary in one call
 */
export async function scanRepo(options: ScanOptions): Promise<RepoSummary> {
  const scanner = new RepoScanner(options);
  const files = await scanner.scan();
  const builder = new RepoIndexBuilder(files, options.rootPath);
  return builder.build();
}
