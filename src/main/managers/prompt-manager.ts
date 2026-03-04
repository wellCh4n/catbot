import { join } from 'path'
import { readFile, writeFile, access } from 'fs/promises'
import { constants } from 'fs'
import { DEFAULT_AGENTS_MD, DEFAULT_IDENTITY_MD } from '../prompts/default'

export class PromptManager {
  private identityPath: string
  private agentsPath: string

  constructor(workspacePath: string) {
    this.identityPath = join(workspacePath, 'IDENTITY.md')
    this.agentsPath = join(workspacePath, 'AGENTS.md')
  }

  async init(): Promise<void> {
    await this.ensureFileExists(this.identityPath, DEFAULT_IDENTITY_MD)
    await this.ensureFileExists(this.agentsPath, DEFAULT_AGENTS_MD)
  }

  private async ensureFileExists(filePath: string, defaultContent: string): Promise<void> {
    try {
      await access(filePath, constants.F_OK)
    } catch {
      await writeFile(filePath, defaultContent, 'utf-8')
    }
  }

  async read(fileName: 'IDENTITY.md' | 'AGENTS.md'): Promise<string> {
    const filePath = fileName === 'IDENTITY.md' ? this.identityPath : this.agentsPath
    try {
      return await readFile(filePath, 'utf-8')
    } catch (error: unknown) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: unknown }).code
          : undefined
      if (code === 'ENOENT') {
        const defaultContent = fileName === 'IDENTITY.md' ? DEFAULT_IDENTITY_MD : DEFAULT_AGENTS_MD
        await writeFile(filePath, defaultContent, 'utf-8')
        return defaultContent
      }
      throw error
    }
  }

  async update(fileName: 'IDENTITY.md' | 'AGENTS.md', content: string): Promise<void> {
    const filePath = fileName === 'IDENTITY.md' ? this.identityPath : this.agentsPath
    await writeFile(filePath, content, 'utf-8')
  }
}
