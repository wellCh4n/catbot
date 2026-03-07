import { ipcMain, BrowserWindow } from 'electron'
import { ChatMessage, AgentUpdate } from '../../common/types'
import { AgentManager } from '../managers/agent-manager'

export function registerAgentHandlers(agentManager: AgentManager): void {
  // Listen for agent events and broadcast to all windows
  agentManager.on('message', (msg: ChatMessage) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('agent-message', msg)
    })
  })

  agentManager.on('update', (update: AgentUpdate) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('agent-update', update)
    })
  })

  // IPC Handler for Agent Loop
  ipcMain.handle('agent-loop', async (_, messages: ChatMessage[]) => {
    try {
      return await agentManager.run(messages)
    } catch (error: unknown) {
      console.error('Agent Loop Failed:', error)
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(msg || 'Failed to run agent loop')
    }
  })
}
