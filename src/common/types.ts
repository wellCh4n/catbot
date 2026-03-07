export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  toolUse?: {
    tool: string
    input: Record<string, unknown>
    output?: string
    toolUseId?: string
  }
  isError?: boolean
}

export interface AgentToolUseUpdate {
  type: 'tool_use'
  tool: string
  input: Record<string, unknown>
  toolUseId: string
  message: ChatMessage
}

export interface AgentToolResultUpdate {
  type: 'tool_result'
  tool: string
  output: string
  id?: string
}

export type AgentUpdate = AgentToolUseUpdate | AgentToolResultUpdate

export type SkillSource = 'workspace' | 'home' | 'builtin'

export interface SkillInfo {
  name: string
  description?: string
  path?: string
  source: SkillSource
}

export interface ChannelConfig {
  feishu: {
    appId: string
    appSecret: string
    encryptKey?: string
    verificationToken?: string
    port?: number
    enabled?: boolean
  }
}
