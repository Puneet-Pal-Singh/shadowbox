import type { MemoryType } from "./context.js";

/**
 * Memory snapshot
 * Durable memory representation
 */
export interface MemorySnapshot {
  /** Summarized long-term memories */
  summaries?: MemoryChunk[];

  /** Pinned high-priority memories */
  pinned?: MemoryChunk[];

  /** Recent short-term memories */
  recent?: MemoryChunk[];
}

/**
 * Individual memory chunk
 */
export interface MemoryChunk {
  /** Unique identifier */
  id: string;

  /** Memory content */
  content: string;

  /** Importance score 0-1 */
  importance: number;

  /** Creation timestamp (ms) */
  timestamp?: number;

  /** Source of memory */
  source?: string;

  /** Memory type */
  type?: MemoryType;

  /** Related entities */
  relatedTo?: string[];
}
