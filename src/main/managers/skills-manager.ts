import { join, delimiter } from 'node:path'
import { readdir, readFile, access } from 'node:fs/promises'
import { constants } from 'node:fs'

export type SkillSource = 'workspace' | 'builtin'

export interface SkillInfo {
  name: string
  path: string
  source: SkillSource
}

type SkillMeta = Record<string, unknown>

export class SkillsManager {
  private workspaceSkillsDir: string
  private builtinSkillsDir: string

  constructor(workspacePath: string, builtinSkillsDir?: string) {
    this.workspaceSkillsDir = join(workspacePath, 'skills')
    this.builtinSkillsDir = builtinSkillsDir ?? join(__dirname, '..', 'skills')
  }

  async listSkills(filterUnavailable: boolean = true): Promise<SkillInfo[]> {
    const skills: SkillInfo[] = []

    if (await this.pathExists(this.workspaceSkillsDir)) {
      const entries = await readdir(this.workspaceSkillsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const skillFile = join(this.workspaceSkillsDir, entry.name, 'SKILL.md')
        if (await this.pathExists(skillFile)) {
          skills.push({ name: entry.name, path: skillFile, source: 'workspace' })
        }
      }
    }

    if (await this.pathExists(this.builtinSkillsDir)) {
      const entries = await readdir(this.builtinSkillsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const name = entry.name
        if (skills.some((s) => s.name === name)) continue
        const skillFile = join(this.builtinSkillsDir, name, 'SKILL.md')
        if (await this.pathExists(skillFile)) {
          skills.push({ name, path: skillFile, source: 'builtin' })
        }
      }
    }

    if (!filterUnavailable) return skills

    const filtered: SkillInfo[] = []
    for (const skill of skills) {
      const skillMeta = await this.getSkillMeta(skill.name)
      if (await this.checkRequirements(skillMeta)) {
        filtered.push(skill)
      }
    }
    return filtered
  }

  async loadSkill(name: string): Promise<string | null> {
    const workspaceSkill = join(this.workspaceSkillsDir, name, 'SKILL.md')
    if (await this.pathExists(workspaceSkill)) {
      return await readFile(workspaceSkill, 'utf-8')
    }

    const builtinSkill = join(this.builtinSkillsDir, name, 'SKILL.md')
    if (await this.pathExists(builtinSkill)) {
      return await readFile(builtinSkill, 'utf-8')
    }

    return null
  }

  async loadSkillsForContext(skillNames: string[]): Promise<string> {
    const parts: string[] = []
    for (const name of skillNames) {
      const content = await this.loadSkill(name)
      if (!content) continue
      const stripped = this.stripFrontmatter(content)
      if (!stripped.trim()) continue
      parts.push(`### Skill: ${name}\n\n${stripped}`)
    }
    return parts.length ? parts.join('\n\n---\n\n') : ''
  }

  async buildSkillsSummary(): Promise<string> {
    const allSkills = await this.listSkills(false)
    if (!allSkills.length) return ''

    const escapeXml = (s: string): string =>
      s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

    const lines: string[] = ['<skills>']
    for (const skill of allSkills) {
      const name = escapeXml(skill.name)
      const location = skill.path
      const desc = escapeXml(await this.getSkillDescription(skill.name))
      const skillMeta = await this.getSkillMeta(skill.name)
      const available = await this.checkRequirements(skillMeta)

      lines.push(`  <skill available="${String(available).toLowerCase()}">`)
      lines.push(`    <name>${name}</name>`)
      lines.push(`    <description>${desc}</description>`)
      lines.push(`    <location>${location}</location>`)

      if (!available) {
        const missing = await this.getMissingRequirements(skillMeta)
        if (missing) {
          lines.push(`    <requires>${escapeXml(missing)}</requires>`)
        }
      }

      lines.push('  </skill>')
    }
    lines.push('</skills>')
    return lines.join('\n')
  }

  async getAlwaysSkills(): Promise<string[]> {
    const result: string[] = []
    const skills = await this.listSkills(true)
    for (const skill of skills) {
      const meta = (await this.getSkillMetadata(skill.name)) ?? {}
      const skillMeta = await this.getSkillMeta(skill.name)

      const alwaysFromNanobot = Boolean((skillMeta as Record<string, unknown>).always)
      const alwaysFromFrontmatter = this.parseBoolean(meta['always'])

      if (alwaysFromNanobot || alwaysFromFrontmatter) {
        result.push(skill.name)
      }
    }
    return result
  }

  async getSkillMetadata(name: string): Promise<Record<string, string> | null> {
    const content = await this.loadSkill(name)
    if (!content) return null

    const match = content.match(/^---\n([\s\S]*?)\n---/m)
    if (!match) return null

    const metadata: Record<string, string> = {}
    for (const line of match[1].split('\n')) {
      const idx = line.indexOf(':')
      if (idx === -1) continue
      const key = line.slice(0, idx).trim()
      const value = line
        .slice(idx + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '')
      if (key) metadata[key] = value
    }
    return metadata
  }

  private async getSkillDescription(name: string): Promise<string> {
    const meta = await this.getSkillMetadata(name)
    if (meta?.description) return meta.description
    return name
  }

  private stripFrontmatter(content: string): string {
    if (!content.startsWith('---')) return content
    const match = content.match(/^---\n[\s\S]*?\n---\n/m)
    if (!match) return content
    return content.slice(match[0].length).trim()
  }

  private async getMissingRequirements(skillMeta: SkillMeta): Promise<string> {
    const missing: string[] = []
    const requires = this.getRequires(skillMeta)

    for (const bin of requires.bins) {
      if (!(await this.isBinAvailable(bin))) {
        missing.push(`CLI: ${bin}`)
      }
    }

    for (const env of requires.env) {
      if (!process.env[env]) {
        missing.push(`ENV: ${env}`)
      }
    }

    return missing.join(', ')
  }

  private async checkRequirements(skillMeta: SkillMeta): Promise<boolean> {
    const requires = this.getRequires(skillMeta)

    for (const bin of requires.bins) {
      if (!(await this.isBinAvailable(bin))) return false
    }

    for (const env of requires.env) {
      if (!process.env[env]) return false
    }

    return true
  }

  private async getSkillMeta(name: string): Promise<SkillMeta> {
    const meta = (await this.getSkillMetadata(name)) ?? {}
    return this.parseNanobotMetadata(meta['metadata'] ?? '')
  }

  private parseNanobotMetadata(raw: string): SkillMeta {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return {}
      const obj = parsed as Record<string, unknown>
      const nanobot = obj['nanobot']
      if (nanobot && typeof nanobot === 'object') return nanobot as SkillMeta
      const openclaw = obj['openclaw']
      if (openclaw && typeof openclaw === 'object') return openclaw as SkillMeta
      return {}
    } catch {
      return {}
    }
  }

  private getRequires(skillMeta: SkillMeta): { bins: string[]; env: string[] } {
    const requires = skillMeta['requires']
    if (!requires || typeof requires !== 'object') return { bins: [], env: [] }
    const req = requires as Record<string, unknown>
    const bins = Array.isArray(req['bins'])
      ? req['bins'].filter((x): x is string => typeof x === 'string')
      : []
    const env = Array.isArray(req['env'])
      ? req['env'].filter((x): x is string => typeof x === 'string')
      : []
    return { bins, env }
  }

  private async isBinAvailable(bin: string): Promise<boolean> {
    if (!bin.trim()) return false

    const hasPathSep = bin.includes('/') || bin.includes('\\')
    if (hasPathSep) return await this.pathExists(bin, true)

    const pathValue = process.env.PATH ?? ''
    const dirs = pathValue.split(delimiter).filter(Boolean)
    for (const dir of dirs) {
      const full = join(dir, bin)
      if (await this.pathExists(full, true)) return true
    }
    return false
  }

  private async pathExists(p: string, executable: boolean = false): Promise<boolean> {
    try {
      await access(p, executable ? constants.X_OK : constants.F_OK)
      return true
    } catch {
      return false
    }
  }

  private parseBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value
    if (typeof value !== 'string') return false
    const v = value.trim().toLowerCase()
    return v === 'true' || v === '1' || v === 'yes' || v === 'on'
  }
}
