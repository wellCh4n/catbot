import { ipcMain, BrowserWindow } from 'electron'
import { SessionManager } from '../managers/session-manager'

export function registerSessionHandlers(sessionManager: SessionManager): void {
  sessionManager.on('session-created', (sessionId: string) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('session-created', sessionId)
    })
  })

  ipcMain.handle('read-session', async (_, sessionId?: string) => {
    return await sessionManager.read(sessionId)
  })

  ipcMain.handle('clear-session', async (_, sessionId?: string) => {
    await sessionManager.clear(sessionId)
    return true
  })

  ipcMain.handle('delete-session', async (_, sessionId: string) => {
    await sessionManager.delete(sessionId)
    return true
  })

  ipcMain.handle('list-sessions', async () => {
    return await sessionManager.listSessions()
  })
}
