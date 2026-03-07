import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { AgentUpdate, ChatMessage } from '../common/types'

export interface SkillListItem {
  name: string
  description: string
  source: 'workspace' | 'home' | 'builtin'
}

// Custom APIs for renderer
const api = {
  readConfigFile: (fileName: string) => {
    if (fileName === 'IDENTITY.md' || fileName === 'AGENTS.md') {
      return ipcRenderer.invoke('read-prompt', fileName)
    }
    return ipcRenderer.invoke('read-config-file', fileName)
  },
  writeConfigFile: (fileName: string, content: string) => {
    if (fileName === 'IDENTITY.md' || fileName === 'AGENTS.md') {
      return ipcRenderer.invoke('write-prompt', fileName, content)
    }
    return ipcRenderer.invoke('write-config-file', fileName, content)
  },
  readWorkspaceDir: (subDir: string = '') => ipcRenderer.invoke('read-workspace-dir', subDir),
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
  openSkillsDir: () => ipcRenderer.invoke('open-skills-dir'),
  installSkillZip: (zipPath: string, force?: boolean) =>
    ipcRenderer.invoke('install-skill-zip', zipPath, force),
  selectSkillZip: () => ipcRenderer.invoke('select-skill-zip'),
  deleteSkill: (name: string) => ipcRenderer.invoke('delete-skill', name),
  agentLoop: (messages: ChatMessage[]) => ipcRenderer.invoke('agent-loop', messages),
  readSession: () => ipcRenderer.invoke('read-session'),
  clearSession: () => ipcRenderer.invoke('clear-session'),
  listSkills: (opts?: { filterUnavailable?: boolean }) =>
    ipcRenderer.invoke('list-skills', opts) as Promise<SkillListItem[]>,
  getChannelConfig: (channelId?: string) => {
    if (channelId) {
      return ipcRenderer.invoke('channel:get-by-id', channelId)
    }
    return ipcRenderer.invoke('channel:get-config')
  },
  updateChannelConfig: (channelId: string, config: unknown) =>
    ipcRenderer.invoke('channel:update-by-id', { channelId, config }),
  onAgentUpdate: (callback: (data: AgentUpdate) => void): (() => void) => {
    const listener = (_event: unknown, value: AgentUpdate): void => callback(value)
    ipcRenderer.on('agent-update', listener)
    return () => ipcRenderer.removeListener('agent-update', listener)
  },
  onAgentMessage: (callback: (data: ChatMessage) => void): (() => void) => {
    const listener = (_event: unknown, value: ChatMessage): void => callback(value)
    ipcRenderer.on('agent-message', listener)
    return () => ipcRenderer.removeListener('agent-message', listener)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
