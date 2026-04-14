/**
 * Memory Module — Public API
 */

export { MemorySearchEngine } from './memory-search'
export { MemoryFileManager } from './memory-file-manager'
export { RelevanceRanker } from './relevance-ranker'
export { MemoryExtractionAgent } from './extraction-agent'
export { VectorStore } from './vector-store'

export type {
  MemoryType,
  MemoryEntry,
  MemoryFrontmatter,
  RankedMemory,
  ExtractionResult,
  MemorySearchOptions
} from './memory-types'

export type { MemoryConfig } from './types'
export { DEFAULT_MEMORY_CONFIG } from './types'
