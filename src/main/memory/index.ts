/**
 * Memory Search Module
 * Export all public APIs
 */

export * from './types'
export * from './config'
export * from './embeddings'
export * from './vector-store'
export * from './memory-search'

// Re-export main classes for convenience
export { MemorySearchEngine } from './memory-search'
export { VectorStore } from './vector-store'
export { createEmbeddingProvider, type EmbeddingProvider } from './embeddings'
export { resolveMemorySearchConfig, getDefaultConfig } from './config'
