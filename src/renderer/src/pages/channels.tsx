import React, { useState, useEffect } from 'react'
import { MessageCircle, Eye, EyeOff } from 'lucide-react'

interface ChannelConfig {
  id: string
  name: string
  type: 'feishu'
  icon: React.ElementType
  config: Record<string, string | boolean>
}

export default function Channels(): React.JSX.Element {
  const [selectedChannel, setSelectedChannel] = useState<string>('feishu')
  const [showAppSecret, setShowAppSecret] = useState(false)
  const [configs, setConfigs] = useState<Record<string, Record<string, string | boolean>>>({
    feishu: {
      enabled: false,
      appId: '',
      appSecret: ''
    }
  })

  useEffect(() => {
    const loadConfig = async (): Promise<void> => {
      try {
        const config = (await window.api.getChannelConfig()) as {
          feishu?: { enabled?: boolean; appId: string; appSecret: string }
        }
        if (config && config.feishu) {
          setConfigs((prev) => ({
            ...prev,
            feishu: {
              enabled: config.feishu?.enabled || false,
              appId: config.feishu?.appId || '',
              appSecret: config.feishu?.appSecret || ''
            }
          }))
        }
      } catch (error) {
        console.error('Failed to load channel config:', error)
      }
    }
    loadConfig()
  }, [])

  const channels: ChannelConfig[] = [
    {
      id: 'feishu',
      name: '飞书 (Feishu)',
      type: 'feishu',
      icon: MessageCircle,
      config: configs.feishu
    }
  ]

  const handleConfigChange = (channelId: string, key: string, value: string | boolean): void => {
    setConfigs((prev) => ({
      ...prev,
      [channelId]: {
        ...prev[channelId],
        [key]: value
      }
    }))
  }

  const handleSave = async (channelId: string): Promise<void> => {
    try {
      const configToSave = configs[channelId]
      if (!configToSave) {
        throw new Error('No config found for channel')
      }
      await window.api.updateChannelConfig(channelId, configToSave)
      alert('配置已保存')
    } catch (error) {
      console.error('Failed to save channel config:', error)
      alert('保存失败')
    }
  }

  return (
    <div className="flex h-full w-full bg-gray-100 dark:bg-gray-800 gap-1">
      {/* Left Sidebar - Channel List */}
      <div className="w-64 bg-white dark:bg-gray-900 rounded-r-lg flex flex-col border-y border-r border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
        <div className="h-11 px-4 flex items-center bg-gray-50/50 dark:bg-gray-800/50">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Channels
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => setSelectedChannel(channel.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                selectedChannel === channel.id
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <channel.icon size={18} />
                {channel.name}
              </div>
              {channel.config.enabled && (
                <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right Content - Configuration Form */}
      <div className="flex-1 bg-white dark:bg-gray-900 rounded-lg flex flex-col border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="p-8 max-w-3xl mx-auto">
            {selectedChannel === 'feishu' && (
              <div className="space-y-8">
                <div className="space-y-6">
                  <div className="flex items-center justify-between py-4 border-b border-gray-100 dark:border-gray-800">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                        启用飞书机器人
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        开启后，CatBot 将通过飞书接收和回复消息
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        handleConfigChange('feishu', 'enabled', !configs.feishu.enabled)
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                        configs.feishu.enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          configs.feishu.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div
                    className={`grid gap-6 transition-opacity duration-200 ${configs.feishu.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}
                  >
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        App ID
                      </label>
                      <input
                        type="text"
                        value={configs.feishu.appId as string}
                        onChange={(e) => handleConfigChange('feishu', 'appId', e.target.value)}
                        placeholder="cli_..."
                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-transparent transition-all text-gray-900 dark:text-white placeholder-gray-400"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        App Secret
                      </label>
                      <div className="relative">
                        <input
                          type={showAppSecret ? 'text' : 'password'}
                          value={configs.feishu.appSecret as string}
                          onChange={(e) =>
                            handleConfigChange('feishu', 'appSecret', e.target.value)
                          }
                          placeholder="Your App Secret"
                          className="w-full px-4 py-2.5 pr-10 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-transparent transition-all text-gray-900 dark:text-white placeholder-gray-400"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAppSecret(!showAppSecret)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          {showAppSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 flex justify-end border-t border-gray-100 dark:border-gray-800">
                    <button
                      onClick={() => handleSave('feishu')}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors focus:outline-none focus:ring-4 focus:ring-blue-500/20 shadow-sm hover:shadow-md active:scale-95 transform duration-100"
                    >
                      保存配置
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
