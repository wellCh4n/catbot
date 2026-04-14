/**
 * VectorStore — FTS5-only SQLite store.
 * Vector/embedding support has been removed; we now use small-model relevance
 * ranking instead. This module provides fast full-text pre-filtering.
 */

import Database from 'better-sqlite3'
import type { MemoryChunk, VectorStoreOptions } from './legacy-types'

export class VectorStore {
  private db: Database.Database

  constructor(options: VectorStoreOptions) {
    this.db = new Database(options.path)
    this.initSchema()
  }

  private initSchema(): void {
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

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        id UNINDEXED,
        content,
        content='chunks',
        content_rowid='rowid'
      )
    `)

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
        INSERT INTO chunks_fts(rowid, id, content) VALUES (new.rowid, new.id, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
        DELETE FROM chunks_fts WHERE rowid = old.rowid;
      END;
      CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
        UPDATE chunks_fts SET content = new.content WHERE rowid = new.rowid;
      END;
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chunks_source_type ON chunks(source_type);
      CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);
    `)
  }

  insert(chunk: MemoryChunk): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO chunks (id, content, source, source_type, timestamp, session_id, message_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      chunk.id,
      chunk.content,
      chunk.metadata.source,
      chunk.metadata.sourceType,
      chunk.metadata.timestamp,
      chunk.metadata.sessionId ?? null,
      chunk.metadata.messageId ?? null,
      JSON.stringify(chunk.metadata)
    )
  }

  insertBatch(chunks: MemoryChunk[]): void {
    const insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO chunks (id, content, source, source_type, timestamp, session_id, message_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const transaction = this.db.transaction((items: MemoryChunk[]) => {
      for (const chunk of items) {
        insertStmt.run(
          chunk.id,
          chunk.content,
          chunk.metadata.source,
          chunk.metadata.sourceType,
          chunk.metadata.timestamp,
          chunk.metadata.sessionId ?? null,
          chunk.metadata.messageId ?? null,
          JSON.stringify(chunk.metadata)
        )
      }
    })
    transaction(chunks)
  }

  /** Full-text search using FTS5. Returns chunks ordered by relevance rank. */
  searchText(query: string, limit: number = 10, sourceTypes?: string[]): MemoryChunk[] {
    // Escape special FTS5 characters
    const safeQuery = query.replace(/["]/g, '""')

    let sql = `
      SELECT c.id, c.content, c.source, c.source_type, c.timestamp,
             c.session_id, c.message_id, c.metadata
      FROM chunks_fts
      JOIN chunks c ON chunks_fts.id = c.id
      WHERE chunks_fts MATCH ?
    `
    const params: unknown[] = [safeQuery]

    if (sourceTypes && sourceTypes.length > 0) {
      sql += ` AND c.source_type IN (${sourceTypes.map(() => '?').join(',')})`
      params.push(...sourceTypes)
    }

    sql += ' ORDER BY rank LIMIT ?'
    params.push(limit)

    try {
      const rows = this.db.prepare(sql).all(...params) as Array<{
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
          ...JSON.parse(row.metadata || '{}'),
          source: row.source,
          sourceType: row.source_type,
          timestamp: row.timestamp,
          sessionId: row.session_id ?? undefined,
          messageId: row.message_id ?? undefined
        }
      }))
    } catch {
      // FTS5 query syntax errors — return empty
      return []
    }
  }

  deleteBySource(source: string): void {
    this.db.prepare('DELETE FROM chunks WHERE source = ?').run(source)
  }

  deleteBySourceType(sourceType: string): void {
    this.db.prepare('DELETE FROM chunks WHERE source_type = ?').run(sourceType)
  }

  count(sourceType?: string): number {
    const result = sourceType
      ? this.db.prepare('SELECT COUNT(*) as n FROM chunks WHERE source_type = ?').get(sourceType)
      : this.db.prepare('SELECT COUNT(*) as n FROM chunks').get()
    return (result as { n: number }).n
  }

  close(): void {
    this.db.close()
  }
}
