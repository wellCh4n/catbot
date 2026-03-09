/**
 * Vector Store Implementation using SQLite
 * Supports both vector similarity and full-text search (FTS5)
 */

import Database from 'better-sqlite3'
import type { MemoryChunk, VectorStoreOptions } from './types'

export class VectorStore {
  private db: Database.Database
  private vectorEnabled: boolean

  constructor(options: VectorStoreOptions) {
    this.db = new Database(options.path)
    this.vectorEnabled = options.vectorEnabled

    this.initSchema()
  }

  private initSchema(): void {
    // Main chunks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        source TEXT NOT NULL,
        source_type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        session_id TEXT,
        message_id TEXT,
        metadata TEXT
      )
    `)

    // Embeddings table (if vector enabled)
    if (this.vectorEnabled) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS embeddings (
          chunk_id TEXT PRIMARY KEY,
          embedding BLOB NOT NULL,
          dimension INTEGER NOT NULL,
          FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
        )
      `)
    }

    // FTS5 virtual table for full-text search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        id UNINDEXED,
        content,
        content='chunks',
        content_rowid='rowid'
      )
    `)

    // Triggers to keep FTS in sync
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
        INSERT INTO chunks_fts(rowid, id, content) VALUES (new.rowid, new.id, new.content);
      END;
    `)

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
        DELETE FROM chunks_fts WHERE rowid = old.rowid;
      END;
    `)

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
        UPDATE chunks_fts SET content = new.content WHERE rowid = new.rowid;
      END;
    `)

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chunks_source_type ON chunks(source_type);
      CREATE INDEX IF NOT EXISTS idx_chunks_session_id ON chunks(session_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_timestamp ON chunks(timestamp);
    `)

    console.log('[VectorStore] Schema initialized')
  }

  /**
   * Insert a single chunk
   */
  insert(chunk: MemoryChunk): void {
    const stmt = this.db.prepare(`
      INSERT INTO chunks (id, content, source, source_type, timestamp, session_id, message_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      chunk.id,
      chunk.content,
      chunk.metadata.source,
      chunk.metadata.sourceType,
      chunk.metadata.timestamp,
      chunk.metadata.sessionId || null,
      chunk.metadata.messageId || null,
      JSON.stringify(chunk.metadata)
    )

    // Insert embedding if available
    if (this.vectorEnabled && chunk.embedding) {
      this.insertEmbedding(chunk.id, chunk.embedding)
    }
  }

  /**
   * Insert batch of chunks (more efficient)
   */
  insertBatch(chunks: MemoryChunk[]): void {
    const insertChunk = this.db.prepare(`
      INSERT INTO chunks (id, content, source, source_type, timestamp, session_id, message_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertEmbed = this.vectorEnabled
      ? this.db.prepare(`
          INSERT INTO embeddings (chunk_id, embedding, dimension)
          VALUES (?, ?, ?)
        `)
      : null

    const transaction = this.db.transaction((chunks: MemoryChunk[]) => {
      for (const chunk of chunks) {
        insertChunk.run(
          chunk.id,
          chunk.content,
          chunk.metadata.source,
          chunk.metadata.sourceType,
          chunk.metadata.timestamp,
          chunk.metadata.sessionId || null,
          chunk.metadata.messageId || null,
          JSON.stringify(chunk.metadata)
        )

        if (insertEmbed && chunk.embedding) {
          const buffer = Buffer.from(new Float32Array(chunk.embedding).buffer)
          insertEmbed.run(chunk.id, buffer, chunk.embedding.length)
        }
      }
    })

    transaction(chunks)
  }

  private insertEmbedding(chunkId: string, embedding: number[]): void {
    const buffer = Buffer.from(new Float32Array(embedding).buffer)
    const stmt = this.db.prepare(`
      INSERT INTO embeddings (chunk_id, embedding, dimension)
      VALUES (?, ?, ?)
    `)
    stmt.run(chunkId, buffer, embedding.length)
  }

  /**
   * Full-text search using FTS5
   */
  searchText(query: string, limit: number = 10, sourceTypes?: string[]): MemoryChunk[] {
    let sql = `
      SELECT c.*, rank
      FROM chunks_fts
      JOIN chunks c ON chunks_fts.id = c.id
    `

    const params: unknown[] = [query]

    if (sourceTypes && sourceTypes.length > 0) {
      sql += ` WHERE c.source_type IN (${sourceTypes.map(() => '?').join(',')})`
      params.push(...sourceTypes)
    }

    sql += `
      ORDER BY rank
      LIMIT ?
    `
    params.push(limit)

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(query, ...params) as Array<{
      id: string
      content: string
      source: string
      source_type: string
      timestamp: number
      session_id: string | null
      message_id: string | null
      metadata: string
    }>

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      metadata: {
        ...JSON.parse(row.metadata),
        source: row.source,
        sourceType: row.source_type,
        timestamp: row.timestamp,
        sessionId: row.session_id || undefined,
        messageId: row.message_id || undefined
      }
    }))
  }

  /**
   * Vector similarity search (cosine similarity)
   */
  searchVector(
    queryEmbedding: number[],
    limit: number = 10,
    sourceTypes?: string[]
  ): Array<{ chunk: MemoryChunk; score: number }> {
    if (!this.vectorEnabled) {
      throw new Error('Vector search is not enabled')
    }

    // Get all embeddings (in production, use approximate nearest neighbor)
    let sql = `
      SELECT c.*, e.embedding, e.dimension
      FROM chunks c
      JOIN embeddings e ON c.id = e.chunk_id
    `

    if (sourceTypes && sourceTypes.length > 0) {
      sql += ` WHERE c.source_type IN (${sourceTypes.map(() => '?').join(',')})`
    }

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...(sourceTypes || [])) as Array<{
      id: string
      content: string
      source: string
      source_type: string
      timestamp: number
      session_id: string | null
      message_id: string | null
      metadata: string
      embedding: Buffer
      dimension: number
    }>

    // Calculate cosine similarity
    const results = rows
      .map((row) => {
        const embedding = Array.from(new Float32Array(row.embedding.buffer))
        const score = cosineSimilarity(queryEmbedding, embedding)

        const chunk: MemoryChunk = {
          id: row.id,
          content: row.content,
          embedding,
          metadata: {
            ...JSON.parse(row.metadata),
            source: row.source,
            sourceType: row.source_type,
            timestamp: row.timestamp,
            sessionId: row.session_id || undefined,
            messageId: row.message_id || undefined
          }
        }

        return { chunk, score }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    return results
  }

  /**
   * Hybrid search: combine vector and text search
   */
  searchHybrid(
    query: string,
    queryEmbedding: number[],
    options: {
      limit?: number
      vectorWeight?: number
      textWeight?: number
      sourceTypes?: string[]
    } = {}
  ): Array<{ chunk: MemoryChunk; score: number }> {
    const limit = options.limit || 10
    const vectorWeight = options.vectorWeight ?? 0.7
    const textWeight = options.textWeight ?? 0.3

    // Get more candidates than needed
    const candidateLimit = limit * 4

    // Vector search
    const vectorResults = this.vectorEnabled
      ? this.searchVector(queryEmbedding, candidateLimit, options.sourceTypes)
      : []

    // Text search
    const textResults = this.searchText(query, candidateLimit, options.sourceTypes)

    // Combine and normalize scores
    const combined = new Map<string, { chunk: MemoryChunk; vectorScore: number; textScore: number }>()

    // Process vector results
    if (vectorResults.length > 0) {
      const maxVectorScore = Math.max(...vectorResults.map((r) => r.score))
      for (const result of vectorResults) {
        combined.set(result.chunk.id, {
          chunk: result.chunk,
          vectorScore: result.score / maxVectorScore,
          textScore: 0
        })
      }
    }

    // Process text results
    if (textResults.length > 0) {
      for (let i = 0; i < textResults.length; i++) {
        const chunk = textResults[i]
        const textScore = 1 - i / textResults.length // Simple ranking score

        const existing = combined.get(chunk.id)
        if (existing) {
          existing.textScore = textScore
        } else {
          combined.set(chunk.id, {
            chunk,
            vectorScore: 0,
            textScore
          })
        }
      }
    }

    // Calculate final hybrid scores
    const finalResults = Array.from(combined.values())
      .map(({ chunk, vectorScore, textScore }) => ({
        chunk,
        score: vectorScore * vectorWeight + textScore * textWeight
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    return finalResults
  }

  /**
   * Delete chunks by session ID
   */
  deleteBySession(sessionId: string): void {
    const stmt = this.db.prepare('DELETE FROM chunks WHERE session_id = ?')
    stmt.run(sessionId)
  }

  /**
   * Delete chunks by source
   */
  deleteBySource(source: string): void {
    const stmt = this.db.prepare('DELETE FROM chunks WHERE source = ?')
    stmt.run(source)
  }

  /**
   * Get total chunk count
   */
  count(sourceType?: string): number {
    const sql = sourceType
      ? 'SELECT COUNT(*) as count FROM chunks WHERE source_type = ?'
      : 'SELECT COUNT(*) as count FROM chunks'

    const stmt = this.db.prepare(sql)
    const result = sourceType ? stmt.get(sourceType) : stmt.get()
    return (result as { count: number }).count
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close()
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same dimension')
  }

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
