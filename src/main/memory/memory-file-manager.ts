/**
 * MemoryFileManager — manages the two-level memory file structure:
 *   memory/MEMORY.md          (lightweight index, always in system prompt)
 *   memory/topics/*.md        (semantic topic files with frontmatter)
 */

import { join, basename } from 'path'
import { readFile, writeFile, readdir, mkdir, stat, access, rename } from 'fs/promises'
import { WORKSPACE_PATH } from '../configs'
import type { MemoryEntry, MemoryFrontmatter, MemoryType } from './memory-types'

const MAX_INDEX_LINES = 200
const STALE_DAYS = 14 // warn if older than this

export class MemoryFileManager {
  readonly memoryDir: string
  readonly topicsDir: string
  readonly indexPath: string

  constructor(baseDir?: string) {
    this.memoryDir = baseDir ?? join(WORKSPACE_PATH, 'memory')
    this.topicsDir = join(this.memoryDir, 'topics')
    this.indexPath = join(this.memoryDir, 'MEMORY.md')
  }

  async init(): Promise<void> {
    await mkdir(this.topicsDir, { recursive: true })

    // Migrate old flat .md files into topics/
    await this.migrateOldFiles()

    // Create default MEMORY.md if missing
    try {
      await access(this.indexPath)
    } catch {
      await this.rebuildIndex()
    }
  }

  // ── Index ──────────────────────────────────────────────────────────────────

  /** Read the MEMORY.md index — injected into every system prompt. */
  async readIndex(): Promise<string> {
    try {
      return await readFile(this.indexPath, 'utf-8')
    } catch {
      return ''
    }
  }

  /** Rebuild MEMORY.md from all current topic files. */
  async rebuildIndex(): Promise<void> {
    const entries = await this.listTopicFiles()

    const byType: Record<MemoryType, MemoryEntry[]> = {
      user: [],
      feedback: [],
      project: [],
      reference: []
    }
    for (const e of entries) {
      byType[e.frontmatter.type]?.push(e)
    }

    const lines: string[] = [
      '# Memory Index',
      '',
      '> Auto-generated. Edit topic files in `memory/topics/` directly.',
      ''
    ]

    const typeLabels: Record<MemoryType, string> = {
      user: '👤 User',
      feedback: '💬 Feedback',
      project: '📁 Project',
      reference: '📚 Reference'
    }

    for (const type of ['user', 'feedback', 'project', 'reference'] as MemoryType[]) {
      const group = byType[type]
      if (!group.length) continue
      lines.push(`## ${typeLabels[type]}`)
      for (const e of group) {
        const staleTag = e.isStale ? ' ⚠️ possibly outdated' : ''
        // First non-empty line of content as summary
        const summary = e.content
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l && !l.startsWith('#')) || ''
        lines.push(`- [${e.frontmatter.title}](topics/${e.filename}) — ${summary}${staleTag}`)
      }
      lines.push('')
    }

    // Clamp to MAX_INDEX_LINES
    const output = lines.slice(0, MAX_INDEX_LINES).join('\n')
    await writeFile(this.indexPath, output, 'utf-8')
  }

  // ── Topic files ────────────────────────────────────────────────────────────

  /** List and parse all topic files in memory/topics/. */
  async listTopicFiles(): Promise<MemoryEntry[]> {
    let files: string[]
    try {
      files = (await readdir(this.topicsDir)).filter((f) => f.endsWith('.md'))
    } catch {
      return []
    }

    const entries: MemoryEntry[] = []
    for (const filename of files) {
      try {
        const entry = await this.readTopicFile(filename)
        entries.push(entry)
      } catch (err) {
        console.warn(`[MemoryFileManager] Failed to parse ${filename}:`, err)
      }
    }
    return entries
  }

  /** Parse a single topic file by filename. */
  async readTopicFile(filename: string): Promise<MemoryEntry> {
    const filePath = join(this.topicsDir, filename)
    const raw = await readFile(filePath, 'utf-8')
    const { frontmatter, body } = parseFrontmatter(raw)
    const ageLabel = getAgeLabel(frontmatter.updatedAt)
    const isStale = isOlderThan(frontmatter.updatedAt, STALE_DAYS)
    return { filePath, filename, frontmatter, content: body, ageLabel, isStale }
  }

  /**
   * Create or update a topic file.
   * @returns The filename of the written file (e.g. "user-preferences.md")
   */
  async writeTopicFile(opts: {
    type: MemoryType
    title: string
    content: string
    existingFilename?: string
  }): Promise<string> {
    const now = new Date().toISOString()
    let filename = opts.existingFilename

    if (!filename) {
      filename = `${opts.type}-${slugify(opts.title)}.md`
    }

    const filePath = join(this.topicsDir, filename)

    // Preserve createdAt if file already exists
    let createdAt = now
    try {
      const existing = await this.readTopicFile(filename)
      createdAt = existing.frontmatter.createdAt
    } catch {
      // New file
    }

    const frontmatter: MemoryFrontmatter = {
      type: opts.type,
      title: opts.title,
      createdAt,
      updatedAt: now
    }

    const content = serializeFrontmatter(frontmatter) + opts.content.trim() + '\n'
    await writeFile(filePath, content, 'utf-8')
    await this.rebuildIndex()
    return filename
  }

  /** Delete a topic file and rebuild the index. */
  async deleteTopicFile(filename: string): Promise<void> {
    const { unlink } = await import('fs/promises')
    await unlink(join(this.topicsDir, filename))
    await this.rebuildIndex()
  }

  // ── Migration ──────────────────────────────────────────────────────────────

  /**
   * One-time migration: move old flat *.md files from memory/ into topics/.
   * Skips MEMORY.md itself.
   */
  private async migrateOldFiles(): Promise<void> {
    let files: string[]
    try {
      files = (await readdir(this.memoryDir)).filter(
        (f) => f.endsWith('.md') && f !== 'MEMORY.md'
      )
    } catch {
      return
    }

    for (const file of files) {
      const src = join(this.memoryDir, file)
      const dest = join(this.topicsDir, file)
      try {
        // Try to parse as topic file first
        const raw = await readFile(src, 'utf-8')
        let content: string

        if (raw.startsWith('---')) {
          // Already has frontmatter — move as-is
          content = raw
        } else {
          // Add default frontmatter
          const mtime = (await stat(src)).mtime.toISOString()
          const fm: MemoryFrontmatter = {
            type: 'reference',
            title: basename(file, '.md').replace(/[-_]/g, ' '),
            createdAt: mtime,
            updatedAt: mtime
          }
          content = serializeFrontmatter(fm) + raw
        }

        await writeFile(dest, content, 'utf-8')
        await rename(src, src + '.migrated')
        console.log(`[MemoryFileManager] Migrated ${file} → topics/${file}`)
      } catch (err) {
        console.warn(`[MemoryFileManager] Failed to migrate ${file}:`, err)
      }
    }
  }
}

// ── Frontmatter helpers ────────────────────────────────────────────────────

function parseFrontmatter(raw: string): { frontmatter: MemoryFrontmatter; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) {
    // No frontmatter — use defaults
    return {
      frontmatter: {
        type: 'reference',
        title: 'Untitled',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      body: raw
    }
  }

  const yamlBlock = match[1]
  const body = match[2]

  const fm: Partial<MemoryFrontmatter> = {}
  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    if (key === 'type') fm.type = value as MemoryType
    else if (key === 'title') fm.title = value.replace(/^['"]|['"]$/g, '')
    else if (key === 'createdAt') fm.createdAt = value
    else if (key === 'updatedAt') fm.updatedAt = value
  }

  const now = new Date().toISOString()
  return {
    frontmatter: {
      type: fm.type ?? 'reference',
      title: fm.title ?? 'Untitled',
      createdAt: fm.createdAt ?? now,
      updatedAt: fm.updatedAt ?? now
    },
    body
  }
}

function serializeFrontmatter(fm: MemoryFrontmatter): string {
  return `---\ntype: ${fm.type}\ntitle: "${fm.title}"\ncreatedAt: ${fm.createdAt}\nupdatedAt: ${fm.updatedAt}\n---\n`
}

// ── Time helpers ───────────────────────────────────────────────────────────

function daysSince(isoDate: string): number {
  const ms = Date.now() - new Date(isoDate).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function isOlderThan(isoDate: string, days: number): boolean {
  return daysSince(isoDate) > days
}

export function getAgeLabel(isoDate: string): string {
  const days = daysSince(isoDate)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} week${days >= 14 ? 's' : ''} ago`
  if (days < 60) return '1 month ago (possibly outdated)'
  return `${Math.floor(days / 30)} months ago (possibly outdated)`
}

// ── String helpers ─────────────────────────────────────────────────────────

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
}
