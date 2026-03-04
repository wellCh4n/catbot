import { ipcMain } from 'electron'
import { SettingsManager } from '../managers/settings-manager'

export function registerSettingsHandlers(settingsManager: SettingsManager): void {
  ipcMain.handle('read-config-file', async (_, fileName: string) => {
    if (fileName === 'catbot.json') {
      const config = await settingsManager.read()
      return JSON.stringify(config, null, 2)
    } else {
      throw new Error('Invalid file name')
    }
  })

  ipcMain.handle('write-config-file', async (_, fileName: string, content: string) => {
    if (fileName === 'catbot.json') {
      await settingsManager.update(content)
    } else {
      throw new Error('Invalid file name')
    }
  })
}
