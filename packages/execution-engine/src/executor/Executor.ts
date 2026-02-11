/**
 * Executor Interface (re-export from types)
 *
 * This module provides the canonical Executor interface for implementations.
 * All concrete executors (Docker, Cloud, etc.) must implement this contract.
 *
 * SOLID: Open/Closed principle — interface is open for extension,
 * closed for modification. New executor implementations can be added
 * without changing this interface.
 */

export type { Executor } from '../types/executor.js'
