import { ipcMain, shell } from 'electron'
import { join, sep } from 'path'
import { readdir } from 'fs/promises'

export function registerFileHandlers(workspacePath: string): void {
  ipcMain.handle('read-workspace-dir', async (_, subDir: string = '') => {
    // Prevent directory traversal
    const targetPath = join(workspacePath, subDir)
    if (targetPath !== workspacePath && !targetPath.startsWith(workspacePath + sep)) {
      throw new Error('Access denied')
    }

    try {
      const entries = await readdir(targetPath, { withFileTypes: true })
      return entries
        .map((entry) => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),
          path: join(subDir, entry.name)
        }))
        .sort((a, b) => {
          // Folders first, then files
          if (a.isDirectory === b.isDirectory) {
            return a.name.localeCompare(b.name)
          }
          return a.isDirectory ? -1 : 1
        })
    } catch (error) {
      console.error('Failed to read workspace directory:', error)
      throw error
    }
  })

  ipcMain.handle('open-file', async (_, filePath: string) => {
    // Prevent directory traversal
    const fullPath = join(workspacePath, filePath)
    if (fullPath !== workspacePath && !fullPath.startsWith(workspacePath + sep)) {
      throw new Error('Access denied')
    }
    await shell.openPath(fullPath)
  })
}
