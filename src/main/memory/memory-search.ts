/**
 * MemorySearchEngine — Claude Code-inspired architecture.
 *
 * Two-level memory:
 *   1. MEMORY.md index   (always injected into system prompt)
 *   2. Topic files       (searched per query via FTS5 pre-filter + Haiku ranking)
 *
 * No OpenAI embeddings required — uses the same Anthropic client as the main chat.
 */

import { join } from 'path'
import { WORKSPACE_PATH } from '../configs'
import type Anthropic from '@anthropic-ai/sdk'
import { VectorStore } from './vector-store'
import { MemoryFileManager } from './memory-file-manager'
import { RelevanceRanker } from './relevance-ranker'
import type { MemoryEntry, MemorySearchOptions, RankedMemory } from './memory-types'
import type { MemoryChunk } from './legacy-types'

const DEFAULT_MAX_RESULTS = 3
const DEFAULT_CANDIDATE_MULTIPLIER = 4 // FTS fetches this many before ranking

export class MemorySearchEngine {
  private fileManager: MemoryFileManager
  private vectorStore: VectorStore
  private ranker: RelevanceRanker | null = null
  private initialized = false

  private readonly storePath: string

  constructor(baseDir?: string) {
    const memoryDir = baseDir ?? join(WORKSPACE_PATH, 'memory')
    this.fileManager = new MemoryFileManager(memoryDir)
    this.storePath = join(memoryDir, 'search.sqlite')
    this.vectorStore = new VectorStore({ path: this.storePath, vectorEnabled: false })
  }

  /**
   * Initialize the engine. Pass the Anthropic client to enable small-model ranking.
   * Without a client the engine falls back to FTS5 ordering.
   */
  async init(client?: Anthropic, rankingModel?: string): Promise<void> {
    if (this.initialized) return

    await this.fileManager.init()

    if (client) {
      this.ranker = new RelevanceRanker(client, rankingModel)
    }

    // Index all topic files into FTS5 for pre-filtering
    await this.syncTopicsToFTS()

    this.initialized = true
    console.log(
      `[MemorySearch] Initialized. Ranker: ${this.ranker ? 'Haiku' : 'FTS5-only'}`
    )
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Get the always-included MEMORY.md index content.
   * Injected into every system prompt regardless of query.
   */
  async getMemoryIndex(): Promise<string> {
    return this.fileManager.readIndex()
  }

  /**
   * Search for relevant memories for a specific user query.
   * Returns ranked results with staleness info.
   */
  async search(options: MemorySearchOptions): Promise<RankedMemory[]> {
    if (!this.initialized) await this.init()

    const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS
    const candidateLimit = maxResults * DEFAULT_CANDIDATE_MULTIPLIER

    // Step 1: FTS5 pre-filter — get candidate chunks
    const ftsCandidates = this.vectorStore.searchText(
      options.query,
      candidateLimit,
      ['memory']
    )

    if (ftsCandidates.length === 0) {
      // FTS found nothing — load all topic files and let the ranker decide
      const allEntries = await this.fileManager.listTopicFiles()
      if (allEntries.length === 0) return []
      return this.rankEntries(options.query, allEntries, maxResults)
    }

    // Step 2: Map chunk sources back to MemoryEntry objects
    const sourceSet = new Set(ftsCandidates.map((c) => c.metadata.source))
    const allEntries = await this.fileManager.listTopicFiles()
    const candidates = allEntries.filter((e) => sourceSet.has(e.filePath))

    if (candidates.length === 0) {
      // FTS chunks reference files that no longer exist — fallback to all
      return this.rankEntries(options.query, allEntries, maxResults)
    }

    return this.rankEntries(options.query, candidates, maxResults)
  }

  /**
   * Get the MemoryFileManager for direct file operations (used by ExtractionAgent).
   */
  getFileManager(): MemoryFileManager {
    return this.fileManager
  }

  /**
   * Re-sync topic files into FTS5 index (call after writing new memories).
   */
  async sync(): Promise<void> {
    await this.syncTopicsToFTS()
  }

  close(): void {
    this.vectorStore.close()
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private async rankEntries(
    query: string,
    entries: MemoryEntry[],
    maxResults: number
  ): Promise<RankedMemory[]> {
    if (this.ranker) {
      return this.ranker.rank(query, entries, maxResults)
    }
    // No ranker — return FTS order
    return entries.slice(0, maxResults).map((entry, i) => ({
      entry,
      score: 1 - i / entries.length,
      reason: 'fts order'
    }))
  }

  /** Index all topic files into SQLite FTS5 for fast pre-filtering. */
  private async syncTopicsToFTS(): Promise<void> {
    const entries = await this.fileManager.listTopicFiles()

    // Clear existing memory chunks and re-index
    this.vectorStore.deleteBySource('memory')

    const chunks: MemoryChunk[] = entries.map((e) => ({
      id: e.filename,
      content: `${e.frontmatter.title}\n\n${e.content}`,
      metadata: {
        source: e.filePath,
        sourceType: 'memory' as const,
        timestamp: new Date(e.frontmatter.updatedAt).getTime()
      }
    }))

    if (chunks.length > 0) {
      this.vectorStore.insertBatch(chunks)
    }

    console.log(`[MemorySearch] FTS indexed ${chunks.length} topic file(s)`)
  }
}
