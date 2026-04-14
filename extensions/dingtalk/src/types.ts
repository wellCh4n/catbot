/**
 * Type definitions for DingTalk Channel
 */

// ─── Logger ──────────────────────────────────────────────────────────────────

export interface ChannelLogSink {
  info?: (...args: any[]) => void
  warn?: (...args: any[]) => void
  error?: (...args: any[]) => void
  debug?: (...args: any[]) => void
}

/** @deprecated Use ChannelLogSink instead */
export type Logger = ChannelLogSink

// ─── Config ──────────────────────────────────────────────────────────────────

export interface DingTalkConfig {
  clientId: string
  clientSecret: string
  robotCode?: string
  corpId?: string
  agentId?: string
  name?: string
  enabled?: boolean
  dmPolicy?: 'open' | 'pairing' | 'allowlist'
  groupPolicy?: 'open' | 'allowlist'
  allowFrom?: string[]
  mediaUrlAllowlist?: string[]
  showThinking?: boolean
  debug?: boolean
  messageType?: 'markdown' | 'card'
  cardTemplateId?: string
  cardTemplateKey?: string
  groups?: Record<string, { systemPrompt?: string }>
  accounts?: Record<string, DingTalkConfig>
  maxConnectionAttempts?: number
  initialReconnectDelay?: number
  maxReconnectDelay?: number
  reconnectJitter?: number
  maxReconnectCycles?: number
  useConnectionManager?: boolean
  mediaMaxMb?: number
  proactivePermissionHint?: {
    enabled?: boolean
    cooldownHours?: number
  }
}

export interface DingTalkChannelConfig {
  enabled?: boolean
  clientId: string
  clientSecret: string
  robotCode?: string
  corpId?: string
  agentId?: string
  name?: string
  dmPolicy?: 'open' | 'pairing' | 'allowlist'
  groupPolicy?: 'open' | 'allowlist'
  allowFrom?: string[]
  mediaUrlAllowlist?: string[]
  showThinking?: boolean
  debug?: boolean
  messageType?: 'markdown' | 'card'
  cardTemplateId?: string
  cardTemplateKey?: string
  groups?: Record<string, { systemPrompt?: string }>
  accounts?: Record<string, DingTalkConfig>
  maxConnectionAttempts?: number
  initialReconnectDelay?: number
  maxReconnectDelay?: number
  reconnectJitter?: number
  maxReconnectCycles?: number
  useConnectionManager?: boolean
  mediaMaxMb?: number
  proactivePermissionHint?: {
    enabled?: boolean
    cooldownHours?: number
  }
}

export interface ResolvedAccount {
  accountId: string
  config: DingTalkConfig
  enabled: boolean
}

// ─── Token ───────────────────────────────────────────────────────────────────

export interface TokenInfo {
  accessToken: string
  expireIn: number
}

export interface TokenResponse {
  accessToken: string
  expireIn: number
}

// ─── API ─────────────────────────────────────────────────────────────────────

export interface DingTalkApiResponse<T = unknown> {
  data?: T
  code?: string
  message?: string
  success?: boolean
}

export interface MediaDownloadResponse {
  downloadUrl?: string
  downloadCode?: string
}

export interface MediaFile {
  path: string
  mimeType: string
}

// ─── Inbound Message ─────────────────────────────────────────────────────────

export interface DingTalkInboundMessage {
  msgId: string
  msgtype: string
  createAt: number
  text?: {
    content: string
    isReplyMsg?: boolean
    repliedMsg?: {
      content?: {
        text?: string
        richText?: Array<{
          msgType?: string
          type?: string
          content?: string
          code?: string
          atName?: string
        }>
      }
    }
  }
  content?: {
    downloadCode?: string
    fileName?: string
    recognition?: string
    richText?: Array<{
      type: string
      text?: string
      atName?: string
      downloadCode?: string
    }>
    quoteContent?: string
  }
  quoteMessage?: {
    msgId?: string
    msgtype?: string
    text?: { content: string }
    senderNick?: string
    senderId?: string
  }
  originalMsgId?: string
  conversationType: string
  conversationId: string
  conversationTitle?: string
  senderId: string
  senderStaffId?: string
  senderNick?: string
  chatbotUserId: string
  sessionWebhook: string
}

export interface MessageContent {
  text: string
  mediaPath?: string
  mediaType?: string
  messageType: string
}

export interface SendMessageOptions {
  title?: string
  useMarkdown?: boolean
  atUserId?: string | null
  log?: any
  mediaPath?: string
  filePath?: string
  mediaUrl?: string
  mediaType?: 'image' | 'voice' | 'video' | 'file'
  accountId?: string
  cardUpdateMode?: 'replace' | 'append' | 'finalize'
  cardFinalize?: boolean
}

export interface SessionWebhookResponse {
  msgtype: string
  markdown?: { title: string; text: string }
  text?: { content: string }
  at?: { atUserIds: string[]; isAtAll: boolean }
}

export interface HandleDingTalkMessageParams {
  accountId: string
  data: DingTalkInboundMessage
  sessionWebhook: string
  log?: any
  dingtalkConfig: DingTalkConfig
}

// ─── Stream ──────────────────────────────────────────────────────────────────

export interface StreamCallbackResponse {
  headers?: { messageId?: string }
  data: string
}

// ─── Connection ──────────────────────────────────────────────────────────────

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTING = 'DISCONNECTING',
  FAILED = 'FAILED',
}

export interface ConnectionManagerConfig {
  maxAttempts: number
  initialDelay: number
  maxDelay: number
  jitter: number
  maxReconnectCycles?: number
  onStateChange?: (state: ConnectionState, error?: string) => void
}

export interface ConnectionAttemptResult {
  success: boolean
  attempt: number
  error?: Error
  nextDelay?: number
}

// ─── Retry ───────────────────────────────────────────────────────────────────

export interface RetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  log?: any
}

// ─── Proactive ───────────────────────────────────────────────────────────────

export interface ProactiveMessagePayload {
  robotCode: string
  msgKey: string
  msgParam: string
  openConversationId?: string
  userIds?: string[]
}

// ─── AI Card ─────────────────────────────────────────────────────────────────

export const AICardStatus = {
  PROCESSING: '1',
  INPUTING: '2',
  FINISHED: '3',
  FAILED: '5',
} as const

export type AICardState = (typeof AICardStatus)[keyof typeof AICardStatus]

export interface AICardInstance {
  cardInstanceId: string
  accessToken: string
  conversationId: string
  createdAt: number
  lastUpdated: number
  state: AICardState
  config?: DingTalkConfig
  lastStreamedContent?: string
}

export interface AICardStreamingRequest {
  outTrackId: string
  guid: string
  key: string
  content: string
  isFull: boolean
  isFinalize: boolean
  isError: boolean
}

// ─── Gateway ─────────────────────────────────────────────────────────────────

export interface GatewayStopResult {
  stop: () => void
}
