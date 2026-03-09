/**
 * Memory Search Engine
 * Main interface for searching conversation history and memory files
 */

import { readFile, readdir, stat } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { VectorStore } from './vector-store'
import { createEmbeddingProvider, type EmbeddingProvider, embedBatch } from './embeddings'
import { resolveMemorySearchConfig } from './config'
import { SessionManager } from '../managers/session-manager'
import { WORKSPACE_PATH } from '../configs'
import type {
  MemorySearchConfig,
  MemoryChunk,
  MemorySearchOptions,
  MemorySearchResult,
  MemorySource
} from './types'
import type { ChatMessage } from '../../common/types'

export class MemorySearchEngine {
  private config: MemorySearchConfig
  private vectorStore: VectorStore
  private embeddingProvider: EmbeddingProvider
  private sessionManager: SessionManager
  private initialized: boolean = false
  private cache: Map<string, MemorySearchResult[]>

  constructor(sessionId: string = 'main', config?: Partial<MemorySearchConfig>) {
    this.config = resolveMemorySearchConfig(sessionId, config)
    this.vectorStore = new VectorStore({
      path: this.config.store.path,
      vectorEnabled: this.config.store.vector.enabled,
      extensionPath: this.config.store.vector.extensionPath
    })
    this.embeddingProvider = createEmbeddingProvider(this.config)
    this.sessionManager = new SessionManager()
    this.cache = new Map()

    console.log('[MemorySearch] Initialized with config:', {
      provider: this.config.provider,
      model: this.config.model,
      storePath: this.config.store.path,
      vectorEnabled: this.config.store.vector.enabled
    })
  }

  /**
   * Initialize and sync data sources
   */
  async init(): Promise<void> {
    if (this.initialized) return

    console.log('[MemorySearch] Starting initialization...')

    // Sync memory sources if configured
    if (this.config.sync.onSessionStart) {
      await this.syncAll()
    }

    this.initialized = true
    console.log('[MemorySearch] Initialization complete')
  }

  /**
   * Search across configured memory sources
   */
  async search(options: MemorySearchOptions): Promise<MemorySearchResult[]> {
    if (!this.initialized) {
      await this.init()
    }

    const {
      query,
      maxResults = this.config.query.maxResults,
      minScore = this.config.query.minScore,
      sources = this.config.sources,
      sessionId
    } = options

    // Check cache
    const cacheKey = JSON.stringify({ query, maxResults, minScore, sources, sessionId })
    if (this.config.cache.enabled && this.cache.has(cacheKey)) {
      console.log('[MemorySearch] Cache hit')
      return this.cache.get(cacheKey)!
    }

    console.log('[MemorySearch] Searching:', { query, maxResults, sources })

    // Sync on search if configured
    if (this.config.sync.onSearch) {
      await this.syncAll()
    }

    // Generate query embedding
    const [queryEmbedding] = await this.embeddingProvider.embed([query])

    // Perform hybrid search
    const results = this.config.query.hybrid.enabled && this.config.store.vector.enabled
      ? this.vectorStore.searchHybrid(query, queryEmbedding, {
          limit: maxResults * 2, // Get more for filtering
          vectorWeight: this.config.query.hybrid.vectorWeight,
          textWeight: this.config.query.hybrid.textWeight,
          sourceTypes: sources
        })
      : // Fallback to text search only
        this.vectorStore.searchText(query, maxResults * 2, sources).map((chunk) => ({
          chunk,
          score: 0.5 // Default score for text-only search
        }))

    // Apply temporal decay if enabled
    let finalResults = results
    if (this.config.query.hybrid.temporalDecay.enabled) {
      finalResults = this.applyTemporalDecay(results)
    }

    // Apply MMR if enabled
    if (this.config.query.hybrid.mmr.enabled && this.config.store.vector.enabled) {
      finalResults = this.applyMMR(finalResults, queryEmbedding)
    }

    // Filter by minimum score and limit
    const filtered = finalResults
      .filter((r) => r.score >= minScore)
      .slice(0, maxResults)
      .map((r) => ({
        chunk: r.chunk,
        score: r.score,
        relevance: r.score
      }))

    // Cache results
    if (this.config.cache.enabled) {
      this.cache.set(cacheKey, filtered)

      // Enforce cache size limit
      if (this.config.cache.maxEntries && this.cache.size > this.config.cache.maxEntries) {
        const firstKey = this.cache.keys().next().value
        this.cache.delete(firstKey)
      }
    }

    console.log(`[MemorySearch] Found ${filtered.length} results`)
    return filtered
  }

  /**
   * Sync all configured data sources
   */
  async syncAll(): Promise<void> {
    console.log('[MemorySearch] Syncing data sources...')

    for (const source of this.config.sources) {
      try {
        if (source === 'memory') {
          await this.syncMemoryFiles()
        } else if (source === 'sessions') {
          await this.syncSessions()
        }
      } catch (error) {
        console.error(`[MemorySearch] Failed to sync ${source}:`, error)
      }
    }

    console.log('[MemorySearch] Sync complete')
  }

  /**
   * Sync memory files (markdown, text files)
   */
  private async syncMemoryFiles(): Promise<void> {
    const memoryDir = join(WORKSPACE_PATH, 'memory')
    const paths = [memoryDir, ...this.config.extraPaths]

    for (const path of paths) {
      try {
        const files = await this.getTextFiles(path)
        console.log(`[MemorySearch] Found ${files.length} files in ${path}`)

        for (const file of files) {
          await this.indexFile(file)
        }
      } catch (error) {
        console.warn(`[MemorySearch] Cannot access ${path}:`, error)
      }
    }
  }

  /**
   * Sync session conversation history
   */
  private async syncSessions(): Promise<void> {
    const sessions = await this.sessionManager.listSessions()
    console.log(`[MemorySearch] Syncing ${sessions.length} sessions`)

    for (const sessionId of sessions) {
      try {
        const messages = await this.sessionManager.read(sessionId)
        await this.indexMessages(messages, sessionId)
      } catch (error) {
        console.error(`[MemorySearch] Failed to sync session ${sessionId}:`, error)
      }
    }
  }

  /**
   * Index a single file
   */
  private async indexFile(filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, 'utf-8')
      const chunks = this.chunkText(content)

      const chunksWithEmbeddings: MemoryChunk[] = []

      // Generate embeddings
      if (this.config.store.vector.enabled) {
        const texts = chunks.map((c) => c.content)
        const embeddings = await embedBatch(this.embeddingProvider, texts, 100)

        for (let i = 0; i < chunks.length; i++) {
          chunksWithEmbeddings.push({
            ...chunks[i],
            embedding: embeddings[i]
          })
        }
      } else {
        chunksWithEmbeddings.push(...chunks)
      }

      // Insert into vector store
      this.vectorStore.insertBatch(chunksWithEmbeddings)

      console.log(`[MemorySearch] Indexed ${filePath}: ${chunks.length} chunks`)
    } catch (error) {
      console.error(`[MemorySearch] Failed to index ${filePath}:`, error)
    }
  }

  /**
   * Index conversation messages
   */
  private async indexMessages(messages: ChatMessage[], sessionId: string): Promise<void> {
    const chunks: MemoryChunk[] = []

    for (const message of messages) {
      const chunk: MemoryChunk = {
        id: randomUUID(),
        content: message.content,
        metadata: {
          source: `session:${sessionId}`,
          sourceType: 'sessions',
          timestamp: message.timestamp,
          sessionId,
          messageId: message.id,
          role: message.role
        }
      }
      chunks.push(chunk)
    }

    // Generate embeddings
    if (this.config.store.vector.enabled && chunks.length > 0) {
      const texts = chunks.map((c) => c.content)
      const embeddings = await embedBatch(this.embeddingProvider, texts, 100)

      for (let i = 0; i < chunks.length; i++) {
        chunks[i].embedding = embeddings[i]
      }
    }

    // Insert into vector store
    if (chunks.length > 0) {
      this.vectorStore.insertBatch(chunks)
      console.log(`[MemorySearch] Indexed session ${sessionId}: ${chunks.length} messages`)
    }
  }

  /**
   * Split text into chunks based on token limits
   */
  private chunkText(text: string): MemoryChunk[] {
    const chunks: MemoryChunk[] = []
    const lines = text.split('\n')
    let currentChunk = ''
    const maxChars = this.config.chunking.tokens * 4 // Rough estimation: 1 token ≈ 4 chars

    for (const line of lines) {
      if (currentChunk.length + line.length > maxChars && currentChunk.length > 0) {
        chunks.push({
          id: randomUUID(),
          content: currentChunk.trim(),
          metadata: {
            source: 'memory',
            sourceType: 'memory',
            timestamp: Date.now()
          }
        })
        // Apply overlap
        const overlapChars = Math.floor(maxChars * (this.config.chunking.overlap / this.config.chunking.tokens))
        currentChunk = currentChunk.slice(-overlapChars) + '\n' + line
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        id: randomUUID(),
        content: currentChunk.trim(),
        metadata: {
          source: 'memory',
          sourceType: 'memory',
          timestamp: Date.now()
        }
      })
    }

    return chunks
  }

  /**
   * Get all text files recursively
   */
  private async getTextFiles(dirPath: string): Promise<string[]> {
    const files: string[] = []
    const textExtensions = ['.md', '.txt', '.text', '.markdown']

    try {
      const entries = await readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name)

        if (entry.isDirectory()) {
          const subFiles = await this.getTextFiles(fullPath)
          files.push(...subFiles)
        } else if (entry.isFile() && textExtensions.includes(extname(entry.name).toLowerCase())) {
          files.push(fullPath)
        }
      }
    } catch (error) {
      // Ignore errors (directory might not exist)
    }

    return files
  }

  /**
   * Apply temporal decay to search results
   */
  private applyTemporalDecay(
    results: Array<{ chunk: MemoryChunk; score: number }>
  ): Array<{ chunk: MemoryChunk; score: number }> {
    const now = Date.now()
    const halfLifeMs = this.config.query.hybrid.temporalDecay.halfLifeDays * 24 * 60 * 60 * 1000

    return results.map((result) => {
      const age = now - result.chunk.metadata.timestamp
      const decay = Math.pow(0.5, age / halfLifeMs)
      return {
        ...result,
        score: result.score * decay
      }
    })
  }

  /**
   * Apply Maximal Marginal Relevance (MMR) for diversity
   */
  private applyMMR(
    results: Array<{ chunk: MemoryChunk; score: number }>,
    queryEmbedding: number[]
  ): Array<{ chunk: MemoryChunk; score: number }> {
    if (results.length === 0) return results

    const lambda = this.config.query.hybrid.mmr.lambda
    const selected: Array<{ chunk: MemoryChunk; score: number }> = []
    const remaining = [...results]

    // Select first result
    selected.push(remaining.shift()!)

    // Iteratively select most relevant and diverse results
    while (remaining.length > 0 && selected.length < this.config.query.maxResults) {
      let maxScore = -Infinity
      let maxIndex = 0

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i]
        if (!candidate.chunk.embedding) continue

        // Calculate relevance to query
        const relevance = candidate.score

        // Calculate max similarity to already selected
        let maxSimilarity = 0
        for (const sel of selected) {
          if (!sel.chunk.embedding) continue
          const sim = cosineSimilarity(candidate.chunk.embedding, sel.chunk.embedding)
          maxSimilarity = Math.max(maxSimilarity, sim)
        }

        // MMR score: λ * relevance - (1-λ) * maxSimilarity
        const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity

        if (mmrScore > maxScore) {
          maxScore = mmrScore
          maxIndex = i
        }
      }

      selected.push(remaining.splice(maxIndex, 1)[0])
    }

    return selected
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Close and cleanup
   */
  close(): void {
    this.vectorStore.close()
    this.cache.clear()
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
  return magnitude === 0 ? 0 : dotProduct / magnitude
}
