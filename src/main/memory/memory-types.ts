/**
 * Memory System Types — Claude Code-inspired Architecture
 */

/** Four fixed memory categories. Excludes derivable information (code, docs, git history). */
export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

/** YAML-like frontmatter parsed from the top of each topic file. */
export interface MemoryFrontmatter {
  type: MemoryType
  title: string
  createdAt: string // ISO date string
  updatedAt: string // ISO date string
}

/** A single parsed memory topic file, ready for ranking/injection. */
export interface MemoryEntry {
  /** Absolute path on disk */
  filePath: string
  /** Filename relative to topics dir, e.g. "user-preferences.md" */
  filename: string
  frontmatter: MemoryFrontmatter
  /** Raw markdown content (body only, without frontmatter) */
  content: string
  /** Human-readable age label: "today", "3 days ago", "2 months ago (possibly outdated)" */
  ageLabel: string
  /** True when the memory is considered potentially stale */
  isStale: boolean
}

/** Result from the small-model relevance ranker. */
export interface RankedMemory {
  entry: MemoryEntry
  /** 0–1 relevance score as determined by the ranking model */
  score: number
  /** Brief reason from the model */
  reason: string
}

/** Output from the background extraction agent. */
export interface ExtractionResult {
  memories: Array<{
    type: MemoryType
    title: string
    content: string
  }>
}

/** Options passed to MemorySearchEngine.search() */
export interface MemorySearchOptions {
  query: string
  maxResults?: number
}
