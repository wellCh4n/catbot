import axios from 'axios'
import { randomUUID } from 'node:crypto'
import { DWClient, TOPIC_ROBOT } from 'dingtalk-stream'
import { AgentManager } from '../managers/agent-manager'
import { SettingsManager } from '../managers/settings-manager'
import { ChatMessage } from '../../common/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface DingTalkInboundMessage {
  msgId?: string
  msgtype: string
  text?: {
    content?: string
    isReplyMsg?: boolean
    repliedMsg?: { content?: { text?: string } }
  }
  content?: {
    recognition?: string
    fileName?: string
    downloadCode?: string
    richText?: Array<{ type?: string; text?: string; atName?: string }>
  }
  conversationId: string
  senderId: string
  senderNick?: string
  sessionWebhook: string
}

// ─── Access Token Cache ───────────────────────────────────────────────────────

const tokenCache = new Map<string, { token: string; expiry: number }>()

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const cached = tokenCache.get(clientId)
  if (cached && cached.expiry > Date.now() + 60_000) {
    return cached.token
  }
  const res = await axios.post<{ accessToken: string; expireIn: number }>(
    'https://api.dingtalk.com/v1.0/oauth2/accessToken',
    { appKey: clientId, appSecret: clientSecret }
  )
  const { accessToken, expireIn } = res.data
  tokenCache.set(clientId, { token: accessToken, expiry: Date.now() + expireIn * 1000 })
  return accessToken
}

// ─── Dedup ────────────────────────────────────────────────────────────────────

const processedMessages = new Map<string, number>()
const DEDUP_TTL_MS = 60_000

function isProcessed(key: string): boolean {
  const expiry = processedMessages.get(key)
  if (expiry === undefined) return false
  if (Date.now() >= expiry) {
    processedMessages.delete(key)
    return false
  }
  return true
}

function markProcessed(key: string): void {
  processedMessages.set(key, Date.now() + DEDUP_TTL_MS)
}

// ─── Message Text Extraction ──────────────────────────────────────────────────

function extractText(data: DingTalkInboundMessage): string {
  const msgtype = data.msgtype || 'text'

  if (msgtype === 'text') {
    const raw = data.text?.content?.trim() || ''
    if (data.text?.isReplyMsg && data.text?.repliedMsg?.content?.text) {
      const quoted = data.text.repliedMsg.content.text.trim()
      return quoted ? `[引用消息: "${quoted}"]\n\n${raw}` : raw
    }
    return raw
  }

  if (msgtype === 'richText') {
    const parts = data.content?.richText || []
    const text = parts
      .map((p) => {
        if (!p.type || p.type === 'text') return p.text || ''
        if (p.type === 'at') return `@${p.atName || ''} `
        return ''
      })
      .join('')
      .trim()
    return text || '[富文本消息]'
  }

  if (msgtype === 'audio') return data.content?.recognition || '<语音消息>'
  if (msgtype === 'picture') return '<图片消息>'
  if (msgtype === 'video') return '<视频消息>'
  if (msgtype === 'file') return `<文件: ${data.content?.fileName || '文件'}>`

  return data.text?.content?.trim() || `[${msgtype}消息]`
}

// ─── Reply via Session Webhook ────────────────────────────────────────────────

async function sendReply(
  clientId: string,
  clientSecret: string,
  sessionWebhook: string,
  text: string
): Promise<void> {
  const token = await getAccessToken(clientId, clientSecret)

  const hasMarkdown = /^[#*>-]|\*\*|__|`|\[/.test(text) || text.includes('\n')
  const body = hasMarkdown
    ? {
        msgtype: 'markdown',
        markdown: {
          title: text
            .split('\n')[0]
            .replace(/^[#*\s\->]+/, '')
            .slice(0, 20) || 'CatBot',
          text
        }
      }
    : { msgtype: 'text', text: { content: text } }

  await axios.post(sessionWebhook, body, {
    headers: {
      'x-acs-dingtalk-access-token': token,
      'Content-Type': 'application/json'
    }
  })
}

// ─── DingtalkChannel ─────────────────────────────────────────────────────────

export class DingtalkChannel {
  private agentManager: AgentManager
  private settingsManager: SettingsManager
  private client?: InstanceType<typeof DWClient>

  constructor(agentManager: AgentManager, settingsManager: SettingsManager) {
    this.agentManager = agentManager
    this.settingsManager = settingsManager
  }

  async start(): Promise<void> {
    const config = await this.settingsManager.read()
    const { clientId, clientSecret, enabled } = config.channel.dingtalk

    if (!enabled) {
      console.log('[DingtalkChannel] Disabled in settings')
      return
    }

    if (!clientId || !clientSecret) {
      console.error('[DingtalkChannel] Missing clientId or clientSecret')
      return
    }

    this.client = new DWClient({ clientId, clientSecret, keepAlive: true })
    ;(this.client as any).config.autoReconnect = true

    this.client.registerCallbackListener(TOPIC_ROBOT, async (res: any) => {
      const messageId = res.headers?.messageId
      try {
        const data = JSON.parse(res.data) as DingTalkInboundMessage

        // Acknowledge immediately so DingTalk won't retry
        if (messageId) {
          try {
            this.client!.socketCallBackResponse(messageId, { success: true })
          } catch (ackErr: any) {
            console.warn('[DingtalkChannel] Ack failed:', ackErr.message)
          }
        }

        // Dedup
        const dedupKey = data.msgId ? `${clientId}:${data.msgId}` : undefined
        if (dedupKey) {
          if (isProcessed(dedupKey)) {
            console.log('[DingtalkChannel] Skipping duplicate:', dedupKey)
            return
          }
          markProcessed(dedupKey)
        }

        await this.handleMessage(clientId, clientSecret, data)
      } catch (err: any) {
        console.error('[DingtalkChannel] Error processing message:', err.message)
      }
    })

    // Non-blocking connect — errors surface in logs, won't crash app startup
    this.client
      .connect()
      .then(() => console.log('[DingtalkChannel] Stream client connected'))
      .catch((err: any) =>
        console.error('[DingtalkChannel] Connection failed:', err.message)
      )

    console.log('[DingtalkChannel] Stream client starting...')
  }

  async stop(): Promise<void> {
    if (this.client) {
      try {
        this.client.disconnect()
      } catch (err: any) {
        console.warn('[DingtalkChannel] Error during disconnect:', err.message)
      }
      this.client = undefined
      console.log('[DingtalkChannel] Stopped')
    }
  }

  private async handleMessage(
    clientId: string,
    clientSecret: string,
    data: DingTalkInboundMessage
  ): Promise<void> {
    const text = extractText(data)
    if (!text) return

    const sessionId = `dingtalk_${data.conversationId}`
    console.log(
      `[DingtalkChannel] Message session=${sessionId} from=${data.senderNick || data.senderId}: ${text.slice(0, 80)}`
    )

    const userMsg: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    }

    try {
      const response = await this.agentManager.run(sessionId, userMsg)
      if (response) {
        await sendReply(clientId, clientSecret, data.sessionWebhook, response)
      }
    } catch (err: any) {
      console.error('[DingtalkChannel] Agent error:', err.message)
      try {
        await sendReply(clientId, clientSecret, data.sessionWebhook, `错误: ${err.message}`)
      } catch (sendErr: any) {
        console.error('[DingtalkChannel] Failed to send error reply:', sendErr.message)
      }
    }
  }
}
