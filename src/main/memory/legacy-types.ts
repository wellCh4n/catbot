/**
 * Legacy internal types for VectorStore and FTS5 layer.
 * These are implementation details — external code should use memory-types.ts.
 */

export type MemorySource = 'memory' | 'sessions'

export interface MemoryChunk {
  id: string
  content: string
  metadata: {
    source: string
    sourceType: MemorySource
    timestamp: number
    sessionId?: string
    messageId?: string
    [key: string]: unknown
  }
}

export interface VectorStoreOptions {
  path: string
  vectorEnabled: boolean
}
