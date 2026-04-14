/**
 * Memory Module — Public Types
 * Re-exports from the new architecture plus the simplified config interface.
 */

export * from './memory-types'
export type { MemoryChunk, VectorStoreOptions, MemorySource } from './legacy-types'

/** Simplified memory configuration. */
export interface MemoryConfig {
  /** Whether the memory system is enabled (default: true) */
  enabled: boolean
  /** Enable background memory extraction after each response (default: true) */
  extractionEnabled: boolean
  /** Model used for relevance ranking and extraction (default: claude-haiku-4-5-20251001) */
  rankingModel: string
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  enabled: true,
  extractionEnabled: true,
  rankingModel: 'claude-haiku-4-5-20251001'
}
