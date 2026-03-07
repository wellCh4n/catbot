import { ipcMain, BrowserWindow } from 'electron'
import { ChatMessage, AgentUpdate } from '../../common/types'
import { AgentManager } from '../managers/agent-manager'

export function registerAgentHandlers(agentManager: AgentManager): void {
  // Listen for agent events and broadcast to all windows
  agentManager.on(
    'message',
    ({ message, sessionId }: { message: ChatMessage; sessionId: string }) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('agent-message', { message, sessionId })
      })
    }
  )

  agentManager.on('update', ({ update, sessionId }: { update: AgentUpdate; sessionId: string }) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('agent-update', { update, sessionId })
    })
  })

  // IPC Handler for Agent Loop
  ipcMain.handle(
    'agent-loop',
    async (_, { messages, sessionId }: { messages: ChatMessage[]; sessionId?: string }) => {
      try {
        return await agentManager.run(sessionId || 'main', messages)
      } catch (error: unknown) {
        console.error('Agent Loop Failed:', error)
        const msg = error instanceof Error ? error.message : String(error)
        throw new Error(msg || 'Failed to run agent loop')
      }
    }
  )
}
