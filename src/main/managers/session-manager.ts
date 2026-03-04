import { join } from 'path'
import { readFile, appendFile, writeFile, access } from 'fs/promises'
import { constants } from 'fs'
import { ChatMessage } from '../../common/types'

export class SessionManager {
  private sessionPath: string

  constructor(workspacePath: string) {
    this.sessionPath = join(workspacePath, 'session.jsonl')
  }

  async init(): Promise<void> {
    await this.ensureFileExists(this.sessionPath)
  }

  private async ensureFileExists(filePath: string): Promise<void> {
    try {
      await access(filePath, constants.F_OK)
    } catch {
      await writeFile(filePath, '', 'utf-8')
    }
  }

  async read(): Promise<ChatMessage[]> {
    try {
      const content = await readFile(this.sessionPath, 'utf-8')
      const lines = content.split('\n').filter((line) => line.trim() !== '')
      return lines.map((line, index) => {
        const msg = JSON.parse(line)
        if (!msg.id) msg.id = `legacy-${index}`
        if (!msg.timestamp) msg.timestamp = Date.now()
        return msg
      }) as ChatMessage[]
    } catch (error) {
      console.warn('Failed to read session.jsonl', error)
      return []
    }
  }

  async append(message: ChatMessage): Promise<void> {
    try {
      const line = JSON.stringify(message) + '\n'
      await appendFile(this.sessionPath, line, 'utf-8')
    } catch (error) {
      console.error('Failed to append to session.jsonl', error)
    }
  }

  async update(id: string, updates: Partial<ChatMessage>): Promise<void> {
    try {
      const messages = await this.read()
      const index = messages.findIndex((m) => m.id === id)
      if (index !== -1) {
        messages[index] = { ...messages[index], ...updates }
        await this.writeAll(messages)
      }
    } catch (error) {
      console.error('Failed to update session message', error)
    }
  }

  async clear(): Promise<void> {
    try {
      await writeFile(this.sessionPath, '', 'utf-8')
    } catch (error) {
      console.error('Failed to clear session', error)
    }
  }

  private async writeAll(messages: ChatMessage[]): Promise<void> {
    const content = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    await writeFile(this.sessionPath, content, 'utf-8')
  }
}
