/**
 * Memory Search Types
 * Based on OpenClaw's memory search architecture
 */

export type EmbeddingProvider = 'openai' | 'local' | 'gemini' | 'voyage' | 'mistral' | 'ollama' | 'auto'

export type MemorySource = 'memory' | 'sessions'

export interface MemorySearchConfig {
  enabled: boolean
  sources: MemorySource[]
  extraPaths: string[]
  provider: EmbeddingProvider
  remote?: {
    baseUrl?: string
    apiKey?: string
    headers?: Record<string, string>
  }
  fallback: EmbeddingProvider | 'none'
  model: string
  local?: {
    modelPath?: string
    modelCacheDir?: string
  }
  store: {
    driver: 'sqlite'
    path: string
    vector: {
      enabled: boolean
      extensionPath?: string
    }
  }
  chunking: {
    tokens: number
    overlap: number
  }
  sync: {
    onSessionStart: boolean
    onSearch: boolean
    watch: boolean
    watchDebounceMs: number
    intervalMinutes: number
    sessions: {
      deltaBytes: number
      deltaMessages: number
    }
  }
  query: {
    maxResults: number
    minScore: number
    hybrid: {
      enabled: boolean
      vectorWeight: number
      textWeight: number
      candidateMultiplier: number
      mmr: {
        enabled: boolean
        lambda: number
      }
      temporalDecay: {
        enabled: boolean
        halfLifeDays: number
      }
    }
  }
  cache: {
    enabled: boolean
    maxEntries?: number
  }
}

export interface MemoryChunk {
  id: string
  content: string
  embedding?: number[]
  metadata: {
    source: string
    sourceType: MemorySource
    timestamp: number
    sessionId?: string
    messageId?: string
    [key: string]: unknown
  }
}

export interface MemorySearchResult {
  chunk: MemoryChunk
  score: number
  relevance?: number
}

export interface EmbeddingRequest {
  texts: string[]
  model?: string
}

export interface EmbeddingResponse {
  embeddings: number[][]
  model: string
  usage?: {
    promptTokens: number
    totalTokens: number
  }
}

export interface VectorStoreOptions {
  path: string
  vectorEnabled: boolean
  extensionPath?: string
}

export interface MemorySearchOptions {
  query: string
  maxResults?: number
  minScore?: number
  sources?: MemorySource[]
  sessionId?: string
}
