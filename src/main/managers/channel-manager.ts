import { SettingsManager, ChannelConfig } from './settings-manager'
import { AgentManager } from './agent-manager'
import { FeishuChannel } from '../channels/feishu-channel'
import { DingtalkChannel } from '../channels/dingtalk-channel'

export class ChannelManager {
  private settingsManager: SettingsManager
  private agentManager?: AgentManager
  private feishuChannel?: FeishuChannel
  private dingtalkChannel?: DingtalkChannel

  constructor(settingsManager: SettingsManager) {
    this.settingsManager = settingsManager
  }

  setAgentManager(agentManager: AgentManager): void {
    this.agentManager = agentManager
  }

  async init(): Promise<void> {
    if (!this.agentManager) {
      console.error('[ChannelManager] AgentManager not set, cannot init channels')
      return
    }

    const config = await this.settingsManager.read()

    // Initialize Feishu Channel if enabled
    if (config.channel?.feishu?.enabled) {
      try {
        console.log('[ChannelManager] Starting Feishu Channel...')
        this.feishuChannel = new FeishuChannel(this.agentManager, this.settingsManager)
        await this.feishuChannel.start()
        console.log('[ChannelManager] Feishu Channel started successfully')
      } catch (err) {
        console.error('[ChannelManager] Failed to start Feishu Channel:', err)
      }
    } else {
      console.log('[ChannelManager] Feishu Channel is disabled')
    }

    // Initialize DingTalk Channel if enabled
    if (config.channel?.dingtalk?.enabled) {
      try {
        console.log('[ChannelManager] Starting DingTalk Channel...')
        this.dingtalkChannel = new DingtalkChannel(this.agentManager, this.settingsManager)
        await this.dingtalkChannel.start()
        console.log('[ChannelManager] DingTalk Channel started successfully')
      } catch (err) {
        console.error('[ChannelManager] Failed to start DingTalk Channel:', err)
      }
    } else {
      console.log('[ChannelManager] DingTalk Channel is disabled')
    }
  }

  async stop(): Promise<void> {
    if (this.feishuChannel) {
      await this.feishuChannel.stop()
    }
    if (this.dingtalkChannel) {
      await this.dingtalkChannel.stop()
    }
  }

  async getChannelConfig(): Promise<ChannelConfig> {
    const config = await this.settingsManager.read()
    return config.channel
  }

  async updateChannelConfig(channelConfig: ChannelConfig): Promise<void> {
    const config = await this.settingsManager.read()

    const feishuWasEnabled = config.channel?.feishu?.enabled
    const oldFeishuConfig = config.channel?.feishu
    const feishuIsEnabled = channelConfig.feishu?.enabled

    const dingtalkWasEnabled = config.channel?.dingtalk?.enabled
    const oldDingtalkConfig = config.channel?.dingtalk
    const dingtalkIsEnabled = channelConfig.dingtalk?.enabled

    // Update config first
    config.channel = channelConfig
    await this.settingsManager.update(config)

    if (this.agentManager) {
      // ── Feishu ──────────────────────────────────────────────────────────────
      if (!feishuWasEnabled && feishuIsEnabled) {
        console.log('[ChannelManager] Feishu enabled, starting...')
        try {
          if (this.feishuChannel) await this.feishuChannel.stop()
          this.feishuChannel = new FeishuChannel(this.agentManager, this.settingsManager)
          await this.feishuChannel.start()
          console.log('[ChannelManager] Feishu Channel started successfully')
        } catch (err) {
          console.error('[ChannelManager] Failed to start Feishu Channel:', err)
        }
      } else if (feishuWasEnabled && !feishuIsEnabled) {
        console.log('[ChannelManager] Feishu disabled, stopping...')
        if (this.feishuChannel) {
          await this.feishuChannel.stop()
          this.feishuChannel = undefined
          console.log('[ChannelManager] Feishu Channel stopped')
        }
      } else if (feishuIsEnabled && feishuWasEnabled) {
        if (JSON.stringify(oldFeishuConfig) !== JSON.stringify(channelConfig.feishu)) {
          console.log('[ChannelManager] Feishu config updated, restarting...')
          try {
            if (this.feishuChannel) await this.feishuChannel.stop()
            this.feishuChannel = new FeishuChannel(this.agentManager, this.settingsManager)
            await this.feishuChannel.start()
            console.log('[ChannelManager] Feishu Channel restarted successfully')
          } catch (err) {
            console.error('[ChannelManager] Failed to restart Feishu Channel:', err)
          }
        }
      }

      // ── DingTalk ─────────────────────────────────────────────────────────────
      if (!dingtalkWasEnabled && dingtalkIsEnabled) {
        console.log('[ChannelManager] DingTalk enabled, starting...')
        try {
          if (this.dingtalkChannel) await this.dingtalkChannel.stop()
          this.dingtalkChannel = new DingtalkChannel(this.agentManager, this.settingsManager)
          await this.dingtalkChannel.start()
          console.log('[ChannelManager] DingTalk Channel started successfully')
        } catch (err) {
          console.error('[ChannelManager] Failed to start DingTalk Channel:', err)
        }
      } else if (dingtalkWasEnabled && !dingtalkIsEnabled) {
        console.log('[ChannelManager] DingTalk disabled, stopping...')
        if (this.dingtalkChannel) {
          await this.dingtalkChannel.stop()
          this.dingtalkChannel = undefined
          console.log('[ChannelManager] DingTalk Channel stopped')
        }
      } else if (dingtalkIsEnabled && dingtalkWasEnabled) {
        if (JSON.stringify(oldDingtalkConfig) !== JSON.stringify(channelConfig.dingtalk)) {
          console.log('[ChannelManager] DingTalk config updated, restarting...')
          try {
            if (this.dingtalkChannel) await this.dingtalkChannel.stop()
            this.dingtalkChannel = new DingtalkChannel(this.agentManager, this.settingsManager)
            await this.dingtalkChannel.start()
            console.log('[ChannelManager] DingTalk Channel restarted successfully')
          } catch (err) {
            console.error('[ChannelManager] Failed to restart DingTalk Channel:', err)
          }
        }
      }
    }
  }

  async getChannel(channelId: string): Promise<unknown> {
    const config = await this.settingsManager.read()
    return config.channel[channelId]
  }

  async setChannel(channelId: string, configData: unknown): Promise<void> {
    const config = await this.settingsManager.read()
    if (!config.channel) {
      // @ts-ignore: Allow assigning empty object if channel is missing
      config.channel = {}
    }
    config.channel[channelId] = configData
    await this.settingsManager.update(config)
  }
}
