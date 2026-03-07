import * as Lark from '@larksuiteoapi/node-sdk'
import { randomUUID } from 'crypto'
import { AgentManager } from '../managers/agent-manager'
import { SettingsManager } from '../managers/settings-manager'
import { ChatMessage, AgentUpdate } from '../../common/types'

export class FeishuChannel {
  private client?: Lark.Client
  private wsClient?: Lark.WSClient
  private agentManager: AgentManager
  private settingsManager: SettingsManager

  constructor(agentManager: AgentManager, settingsManager: SettingsManager) {
    this.agentManager = agentManager
    this.settingsManager = settingsManager
  }

  async start(): Promise<void> {
    const config = await this.settingsManager.read()
    const { appId, appSecret, enabled } = config.channel.feishu

    if (!enabled) {
      console.log('[FeishuChannel] Disabled in settings')
      return
    }

    if (!appId || !appSecret) {
      console.error('[FeishuChannel] Missing appId or appSecret')
      return
    }

    // Initialize API Client
    this.client = new Lark.Client({
      appId,
      appSecret,
      appType: Lark.AppType.SelfBuild,
      domain: Lark.Domain.Feishu
    })

    // Initialize WS Client
    this.wsClient = new Lark.WSClient({
      appId,
      appSecret,
      loggerLevel: Lark.LoggerLevel.info
    })

    // Register Event Handler
    this.wsClient.start({
      eventDispatcher: new Lark.EventDispatcher({}).register({
        'im.message.receive_v1': async (data) => {
          try {
            const {
              message: { chat_id, content, message_id }
            } = data

            const parsedContent = JSON.parse(content)
            const text = parsedContent.text

            console.log(
              `[FeishuChannel] Received message: ${text} from ${chat_id} (msg_id: ${message_id})`
            )

            // Process message asynchronously
            this.handleMessage(chat_id, text)
          } catch (error) {
            console.error('[FeishuChannel] Error processing message event:', error)
          }
        }
      })
    })

    console.log('[FeishuChannel] WebSocket client started')
  }

  async stop(): Promise<void> {
    if (this.wsClient) {
      // WSClient doesn't have a stop/close method exposed in types sometimes,
      // but if it does we should call it. The official SDK might not expose a clean stop.
      // We will just set it to undefined.
      this.wsClient = undefined
      console.log('[FeishuChannel] WebSocket client stopped')
    }
    this.client = undefined
  }

  private async handleMessage(chatId: string, text: string): Promise<void> {
    try {
      if (!this.client) return

      // Convert to ChatMessage
      const userMsg: ChatMessage = {
        id: randomUUID(),
        role: 'user',
        content: text,
        timestamp: Date.now()
      }

      // Run Agent
      // Note: We are not maintaining history for now, just 1-turn conversation
      const response = await this.agentManager.run([userMsg], async (update) => {
        await this.handleUpdate(chatId, update)
      })

      if (response) {
        await this.sendText(chatId, response)
      } else {
        // If response is empty string, agent might have failed or just done nothing.
        // We can choose to send nothing or a fallback.
        // For now, let's only send if there is content.
      }
    } catch (error) {
      console.error('[FeishuChannel] Error handling message:', error)
      if (this.client) {
        await this.sendText(
          chatId,
          `Error: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  }

  private async handleUpdate(chatId: string, update: AgentUpdate): Promise<void> {
    if (update.type === 'tool_use') {
      const text = `🛠️ Using Tool: ${update.tool}\nInput: ${JSON.stringify(update.input)}`
      await this.sendText(chatId, text)
    } else if (update.type === 'tool_result') {
      const output =
        update.output.length > 500 ? update.output.slice(0, 500) + '...' : update.output
      const text = `✅ Tool Result (${update.tool}):\n${output}`
      await this.sendText(chatId, text)
    }
  }

  private async sendText(chatId: string, text: string): Promise<void> {
    if (!this.client) return
    try {
      await this.client.im.message.create({
        data: {
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({ text }),
          uuid: randomUUID()
        },
        params: {
          receive_id_type: 'chat_id'
        }
      })
    } catch (e) {
      console.error('[FeishuChannel] Failed to send message', e)
    }
  }
}
