/**
 * RepoSummaryFormatter - Serializes RepoSummary to text formats
 *
 * Single responsibility: Convert structured data to readable text
 * Deterministic output for token efficiency
 */
import type { RepoSummary } from "../types.js";

/**
 * Format repository summary
 */
export class RepoSummaryFormatter {
  /**
   * Format summary as readable text block (token-efficient)
   */
  static formatText(summary: RepoSummary): string {
    const lines: string[] = [];

    lines.push("Repo Awareness Summary");
    lines.push("======================");
    lines.push("");

    // Metadata
    lines.push(`Scanned: ${summary.scannedAt}`);
    lines.push(`Total files: ${summary.totalFiles}`);
    lines.push("");

    // File distribution
    lines.push("File Distribution:");
    const kinds = Object.entries(summary.byKind)
      .sort(([, a], [, b]) => b - a)
      .filter(([, count]) => count > 0);
    for (const [kind, count] of kinds) {
      lines.push(`- ${kind}: ${count} files`);
    }
    lines.push("");

    // Entry points
    if (summary.entryPoints.length > 0) {
      lines.push("Entry Points:");
      for (const file of summary.entryPoints.slice(0, 5)) {
        lines.push(`- ${file.path}${file.loc ? ` (${file.loc} LOC)` : ""}`);
      }
      lines.push("");
    }

    // Largest files
    if (summary.largestFiles.length > 0) {
      lines.push("Largest Files:");
      for (const file of summary.largestFiles.slice(0, 5)) {
        lines.push(`- ${file.path}${file.loc ? ` (${file.loc} LOC)` : ""}`);
      }
      lines.push("");
    }

    // Most important
    if (summary.importantFiles.length > 0) {
      lines.push("Most Important:");
      for (const file of summary.importantFiles.slice(0, 5)) {
        lines.push(
          `- ${file.path} (importance: ${file.importance.toFixed(2)})`,
        );
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Format for debug output (verbose)
   */
  static formatDebug(summary: RepoSummary): string {
    const lines: string[] = [];

    lines.push("=== REPO AWARENESS DEBUG ===");
    lines.push("");

    lines.push(`Root: ${summary.rootPath}`);
    lines.push(`Scanned: ${summary.scannedAt}`);
    lines.push(`Total: ${summary.totalFiles} files`);
    lines.push("");

    lines.push("By Kind:");
    for (const [kind, count] of Object.entries(summary.byKind).sort()) {
      lines.push(`  ${kind}: ${count}`);
    }
    lines.push("");

    lines.push(`Entry Points (${summary.entryPoints.length}):`);
    for (const file of summary.entryPoints) {
      lines.push(`  ${file.path} (${file.kind}, importance: ${file.importance.toFixed(2)})`);
    }
    lines.push("");

    lines.push(`Most Important (${summary.importantFiles.length}):`);
    for (const file of summary.importantFiles.slice(0, 10)) {
      lines.push(`  ${file.path}: ${file.importance.toFixed(2)}`);
    }
    lines.push("");

    lines.push(`Largest Files (${summary.largestFiles.length}):`);
    for (const file of summary.largestFiles.slice(0, 10)) {
      lines.push(`  ${file.path}: ${file.size} bytes`);
    }
    lines.push("");

    return lines.join("\n");
  }

  /**
   * Format as JSON
   */
  static formatJson(summary: RepoSummary): string {
    return JSON.stringify(summary, null, 2);
  }

  /**
   * Format as compact single-line JSON
   */
  static formatJsonCompact(summary: RepoSummary): string {
    return JSON.stringify(summary);
  }
}
