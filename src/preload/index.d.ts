import { ElectronAPI } from '@electron-toolkit/preload'
import { ChatMessage, AgentUpdate } from '../common/types'

interface FileEntry {
  name: string
  isDirectory: boolean
  path: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      readConfigFile: (fileName: string) => Promise<string>
      writeConfigFile: (fileName: string, content: string) => Promise<void>
      readWorkspaceDir: (subDir?: string) => Promise<FileEntry[]>
      openFile: (filePath: string) => Promise<void>
      agentLoop: (messages: ChatMessage[]) => Promise<string>
      readSession: () => Promise<ChatMessage[]>
      clearSession: () => Promise<void>
      onAgentUpdate: (callback: (data: AgentUpdate) => void) => () => void
    }
  }
}
