import { ipcMain } from 'electron'
import { PromptManager } from '../managers/prompt-manager'

export function registerPromptHandlers(promptManager: PromptManager): void {
  ipcMain.handle('read-prompt', async (_, fileName: string) => {
    if (fileName === 'IDENTITY.md' || fileName === 'AGENTS.md') {
      return await promptManager.read(fileName)
    }
    throw new Error('Invalid prompt file')
  })

  ipcMain.handle('write-prompt', async (_, fileName: string, content: string) => {
    if (fileName === 'IDENTITY.md' || fileName === 'AGENTS.md') {
      await promptManager.update(fileName, content)
    } else {
      throw new Error('Invalid prompt file')
    }
  })
}
