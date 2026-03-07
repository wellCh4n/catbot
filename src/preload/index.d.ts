import { ElectronAPI } from '@electron-toolkit/preload'
import { ChatMessage, AgentUpdate, ChannelConfig } from '../common/types'

interface FileEntry {
  name: string
  isDirectory: boolean
  path: string
}

interface SkillListItem {
  name: string
  description: string
  source: 'workspace' | 'home' | 'builtin'
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      readConfigFile: (fileName: string) => Promise<string>
      writeConfigFile: (fileName: string, content: string) => Promise<void>
      readWorkspaceDir: (subDir?: string) => Promise<FileEntry[]>
      openFile: (filePath: string) => Promise<void>
      openSkillsDir: () => Promise<void>
      installSkillZip: (zipPath: string, force?: boolean) => Promise<string>
      selectSkillZip: () => Promise<string | null>
      deleteSkill: (name: string) => Promise<void>
      agentLoop: (messages: ChatMessage[]) => Promise<string>
      readSession: () => Promise<ChatMessage[]>
      clearSession: () => Promise<void>
      listSkills: (opts?: { filterUnavailable?: boolean }) => Promise<SkillListItem[]>
      getChannelConfig: (channelId?: string) => Promise<ChannelConfig | unknown>
      updateChannelConfig: (channelId: string, config: unknown) => Promise<void>
      onAgentUpdate: (callback: (data: AgentUpdate) => void) => () => void
      onAgentMessage: (callback: (data: ChatMessage) => void) => () => void
    }
  }
}
