import { join, parse } from 'path'
import { readFile, appendFile, writeFile, access, mkdir, readdir, unlink } from 'fs/promises'
import { constants } from 'fs'
import { WORKSPACE_PATH } from '../configs'
import { ChatMessage } from '../../common/types'
import { EventEmitter } from 'events'

export class SessionManager extends EventEmitter {
  private sessionsDir: string

  constructor() {
    super()
    this.sessionsDir = join(WORKSPACE_PATH, 'sessions')
  }

  async init(): Promise<void> {
    await this.ensureDirectoryExists(this.sessionsDir)
    // Migrate legacy session.jsonl if it exists and main.jsonl doesn't
    const legacyPath = join(WORKSPACE_PATH, 'session.jsonl')
    const mainPath = this.getSessionPath('main')

    try {
      await access(legacyPath, constants.F_OK)
      try {
        await access(mainPath, constants.F_OK)
      } catch {
        // main.jsonl doesn't exist, migrate legacy content
        const content = await readFile(legacyPath, 'utf-8')
        await writeFile(mainPath, content, 'utf-8')
      }
    } catch {
      // legacy file doesn't exist, just ensure main exists
      await this.ensureFileExists(mainPath)
    }
  }

  private getSessionPath(sessionId: string): string {
    return join(this.sessionsDir, `${sessionId}.jsonl`)
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await access(dirPath, constants.F_OK)
    } catch {
      await mkdir(dirPath, { recursive: true })
    }
  }

  private async ensureFileExists(filePath: string): Promise<void> {
    try {
      await access(filePath, constants.F_OK)
    } catch {
      await writeFile(filePath, '', 'utf-8')
      const sessionId = parse(filePath).name
      this.emit('session-created', sessionId)
    }
  }

  async listSessions(): Promise<string[]> {
    try {
      const files = await readdir(this.sessionsDir)
      return files
        .filter((file) => file.endsWith('.jsonl'))
        .map((file) => parse(file).name)
        .sort((a, b) => {
          if (a === 'main') return -1
          if (b === 'main') return 1
          return a.localeCompare(b)
        })
    } catch (error) {
      console.warn('Failed to list sessions', error)
      return ['main']
    }
  }

  async read(sessionId: string = 'main'): Promise<ChatMessage[]> {
    const sessionPath = this.getSessionPath(sessionId)

    try {
      await this.ensureFileExists(sessionPath)
      const content = await readFile(sessionPath, 'utf-8')
      const lines = content.split('\n').filter((line) => line.trim() !== '')
      return lines
        .map((line, index) => {
          try {
            const msg = JSON.parse(line)
            if (!msg.id) msg.id = `legacy-${index}`
            if (!msg.timestamp) msg.timestamp = Date.now()
            return msg
          } catch {
            return null
          }
        })
        .filter((msg): msg is ChatMessage => msg !== null)
    } catch (error) {
      console.warn(`Failed to read session ${sessionId}`, error)
      return []
    }
  }

  async append(message: ChatMessage, sessionId: string = 'main'): Promise<void> {
    const sessionPath = this.getSessionPath(sessionId)

    try {
      await this.ensureFileExists(sessionPath)
      const line = JSON.stringify(message) + '\n'
      await appendFile(sessionPath, line, 'utf-8')
    } catch (error) {
      console.error(`Failed to append to session ${sessionId}`, error)
    }
  }

  async update(
    id: string,
    updates: Partial<ChatMessage>,
    sessionId: string = 'main'
  ): Promise<void> {
    try {
      const messages = await this.read(sessionId)
      const index = messages.findIndex((m) => m.id === id)
      if (index !== -1) {
        messages[index] = { ...messages[index], ...updates }
        await this.writeAll(messages, sessionId)
      }
    } catch (error) {
      console.error(`Failed to update session message in ${sessionId}`, error)
    }
  }

  async clear(sessionId: string = 'main'): Promise<void> {
    const sessionPath = this.getSessionPath(sessionId)
    try {
      await writeFile(sessionPath, '', 'utf-8')
    } catch (error) {
      console.error(`Failed to clear session ${sessionId}`, error)
    }
  }

  async delete(sessionId: string): Promise<void> {
    if (sessionId === 'main') return
    const sessionPath = this.getSessionPath(sessionId)
    try {
      await unlink(sessionPath)
    } catch (error) {
      console.error(`Failed to delete session ${sessionId}`, error)
    }
  }

  private async writeAll(messages: ChatMessage[], sessionId: string): Promise<void> {
    const sessionPath = this.getSessionPath(sessionId)
    const content = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    await writeFile(sessionPath, content, 'utf-8')
  }
}
