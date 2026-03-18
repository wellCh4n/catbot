import React, { useState, useEffect } from 'react'
import { MessageCircle, Eye, EyeOff } from 'lucide-react'

interface ChannelConfig {
  id: string
  name: string
  icon: React.ElementType
  config: Record<string, unknown>
}

type DingtalkConfig = {
  enabled: boolean
  clientId: string
  clientSecret: string
  robotCode: string
  dmPolicy: string
  groupPolicy: string
  messageType: string
  maxReconnectCycles: string
  mediaMaxMb: string
  allowFrom: string
}

type FeishuConfig = {
  enabled: boolean
  appId: string
  appSecret: string
}

export default function Channels(): React.JSX.Element {
  const [selectedChannel, setSelectedChannel] = useState<string>('feishu')
  const [showFeishuSecret, setShowFeishuSecret] = useState(false)
  const [showDingtalkSecret, setShowDingtalkSecret] = useState(false)

  const [feishu, setFeishu] = useState<FeishuConfig>({
    enabled: false,
    appId: '',
    appSecret: ''
  })

  const [dingtalk, setDingtalk] = useState<DingtalkConfig>({
    enabled: false,
    clientId: '',
    clientSecret: '',
    robotCode: '',
    dmPolicy: 'open',
    groupPolicy: 'open',
    messageType: 'markdown',
    maxReconnectCycles: '0',
    mediaMaxMb: '20',
    allowFrom: '*'
  })

  useEffect(() => {
    const loadConfig = async (): Promise<void> => {
      try {
        const config = (await window.api.getChannelConfig()) as {
          feishu?: { enabled?: boolean; appId?: string; appSecret?: string }
          dingtalk?: {
            enabled?: boolean
            clientId?: string
            clientSecret?: string
            robotCode?: string
            dmPolicy?: string
            groupPolicy?: string
            messageType?: string
            maxReconnectCycles?: number
            mediaMaxMb?: number
            allowFrom?: string[]
          }
        }

        if (config.feishu) {
          setFeishu({
            enabled: config.feishu.enabled || false,
            appId: config.feishu.appId || '',
            appSecret: config.feishu.appSecret || ''
          })
        }

        if (config.dingtalk) {
          const d = config.dingtalk
          setDingtalk({
            enabled: d.enabled || false,
            clientId: d.clientId || '',
            clientSecret: d.clientSecret || '',
            robotCode: d.robotCode || '',
            dmPolicy: d.dmPolicy || 'open',
            groupPolicy: d.groupPolicy || 'open',
            messageType: d.messageType || 'markdown',
            maxReconnectCycles: String(d.maxReconnectCycles ?? 0),
            mediaMaxMb: String(d.mediaMaxMb ?? 20),
            allowFrom: Array.isArray(d.allowFrom) ? d.allowFrom.join(', ') : (d.allowFrom || '*')
          })
        }
      } catch (error) {
        console.error('Failed to load channel config:', error)
      }
    }
    loadConfig()
  }, [])

  const channels: ChannelConfig[] = [
    { id: 'feishu', name: '飞书 (Feishu)', icon: MessageCircle, config: feishu },
    { id: 'dingtalk', name: '钉钉 (DingTalk)', icon: MessageCircle, config: dingtalk }
  ]

  const handleSaveFeishu = async (): Promise<void> => {
    try {
      await window.api.updateChannelConfig('feishu', feishu)
      alert('配置已保存')
    } catch {
      alert('保存失败')
    }
  }

  const handleSaveDingtalk = async (): Promise<void> => {
    try {
      const allowFromArr = dingtalk.allowFrom
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const payload = {
        ...dingtalk,
        maxReconnectCycles: dingtalk.maxReconnectCycles !== '' ? Number(dingtalk.maxReconnectCycles) : 0,
        mediaMaxMb: dingtalk.mediaMaxMb !== '' ? Number(dingtalk.mediaMaxMb) : 20,
        allowFrom: allowFromArr
      }
      await window.api.updateChannelConfig('dingtalk', payload)
      alert('配置已保存')
    } catch {
      alert('保存失败')
    }
  }

  // ─── Shared sub-components ─────────────────────────────────────────────────

  const Toggle = ({
    checked,
    onChange
  }: {
    checked: boolean
    onChange: () => void
  }): React.JSX.Element => (
    <button
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )

  const Field = ({
    label,
    hint,
    children
  }: {
    label: string
    hint?: string
    children: React.ReactNode
  }): React.JSX.Element => (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      {hint && <p className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
      {children}
    </div>
  )

  const inputClass =
    'w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-transparent transition-all text-gray-900 dark:text-white placeholder-gray-400 text-sm'

  const selectClass =
    'w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-transparent transition-all text-gray-900 dark:text-white text-sm'

  const SaveButton = ({ onClick }: { onClick: () => void }): React.JSX.Element => (
    <div className="pt-6 flex justify-end border-t border-gray-100 dark:border-gray-800">
      <button
        onClick={onClick}
        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors focus:outline-none focus:ring-4 focus:ring-blue-500/20 shadow-sm hover:shadow-md active:scale-95 transform duration-100 text-sm"
      >
        保存配置
      </button>
    </div>
  )

  const SectionTitle = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider pt-2">
      {children}
    </p>
  )

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full bg-gray-100 dark:bg-gray-800 gap-1">
      {/* Left Sidebar */}
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
              {!!channel.config.enabled && (
                <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right Content */}
      <div className="flex-1 bg-white dark:bg-gray-900 rounded-lg flex flex-col border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="p-8 max-w-3xl mx-auto">

            {/* ── Feishu ── */}
            {selectedChannel === 'feishu' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between py-4 border-b border-gray-100 dark:border-gray-800">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">启用飞书机器人</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      开启后，CatBot 将通过飞书接收和回复消息
                    </p>
                  </div>
                  <Toggle checked={feishu.enabled} onChange={() => setFeishu((p) => ({ ...p, enabled: !p.enabled }))} />
                </div>

                <div className={`grid gap-6 transition-opacity duration-200 ${feishu.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                  <Field label="App ID">
                    <input
                      type="text"
                      value={feishu.appId}
                      onChange={(e) => setFeishu((p) => ({ ...p, appId: e.target.value }))}
                      placeholder="cli_..."
                      className={inputClass}
                    />
                  </Field>

                  <Field label="App Secret">
                    <div className="relative">
                      <input
                        type={showFeishuSecret ? 'text' : 'password'}
                        value={feishu.appSecret}
                        onChange={(e) => setFeishu((p) => ({ ...p, appSecret: e.target.value }))}
                        placeholder="Your App Secret"
                        className={`${inputClass} pr-10`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowFeishuSecret(!showFeishuSecret)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        {showFeishuSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </Field>
                </div>

                <SaveButton onClick={handleSaveFeishu} />
              </div>
            )}

            {/* ── DingTalk ── */}
            {selectedChannel === 'dingtalk' && (
              <div className="space-y-6">
                {/* Enable toggle */}
                <div className="flex items-center justify-between py-4 border-b border-gray-100 dark:border-gray-800">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">启用钉钉机器人</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      使用 Stream 模式接入，无需公网 IP
                    </p>
                  </div>
                  <Toggle
                    checked={dingtalk.enabled}
                    onChange={() => setDingtalk((p) => ({ ...p, enabled: !p.enabled }))}
                  />
                </div>

                <div className={`space-y-6 transition-opacity duration-200 ${dingtalk.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>

                  {/* Required */}
                  <SectionTitle>必填</SectionTitle>

                  <Field label="Client ID">
                    <input
                      type="text"
                      value={dingtalk.clientId}
                      onChange={(e) => setDingtalk((p) => ({ ...p, clientId: e.target.value }))}
                      placeholder="钉钉应用的 Client ID"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Client Secret">
                    <div className="relative">
                      <input
                        type={showDingtalkSecret ? 'text' : 'password'}
                        value={dingtalk.clientSecret}
                        onChange={(e) => setDingtalk((p) => ({ ...p, clientSecret: e.target.value }))}
                        placeholder="钉钉应用的 Client Secret"
                        className={`${inputClass} pr-10`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowDingtalkSecret(!showDingtalkSecret)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        {showDingtalkSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </Field>

                  {/* Optional */}
                  <SectionTitle>选填</SectionTitle>

                  <Field label="Robot Code" hint="机器人的 robotCode，通常与 Client ID 相同，留空则使用 Client ID">
                    <input
                      type="text"
                      value={dingtalk.robotCode}
                      onChange={(e) => setDingtalk((p) => ({ ...p, robotCode: e.target.value }))}
                      placeholder="留空使用 Client ID"
                      className={inputClass}
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="私聊策略 (dmPolicy)" hint="open：所有人可私聊；closed：禁止私聊">
                      <select
                        value={dingtalk.dmPolicy}
                        onChange={(e) => setDingtalk((p) => ({ ...p, dmPolicy: e.target.value }))}
                        className={selectClass}
                      >
                        <option value="open">open（所有人）</option>
                        <option value="closed">closed（禁止）</option>
                      </select>
                    </Field>

                    <Field label="群聊策略 (groupPolicy)" hint="open：无需 @；closed：需要 @ 机器人">
                      <select
                        value={dingtalk.groupPolicy}
                        onChange={(e) => setDingtalk((p) => ({ ...p, groupPolicy: e.target.value }))}
                        className={selectClass}
                      >
                        <option value="open">open（无需 @）</option>
                        <option value="closed">closed（需要 @）</option>
                      </select>
                    </Field>
                  </div>

                  <Field label="消息格式 (messageType)" hint="回复消息时使用的格式">
                    <select
                      value={dingtalk.messageType}
                      onChange={(e) => setDingtalk((p) => ({ ...p, messageType: e.target.value }))}
                      className={selectClass}
                    >
                      <option value="markdown">markdown</option>
                      <option value="text">text</option>
                    </select>
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="最大重连次数" hint="0 表示不限制">
                      <input
                        type="number"
                        min="0"
                        value={dingtalk.maxReconnectCycles}
                        onChange={(e) => setDingtalk((p) => ({ ...p, maxReconnectCycles: e.target.value }))}
                        className={inputClass}
                      />
                    </Field>

                    <Field label="媒体大小上限 (MB)" hint="最大 50 MB">
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={dingtalk.mediaMaxMb}
                        onChange={(e) => setDingtalk((p) => ({ ...p, mediaMaxMb: e.target.value }))}
                        className={inputClass}
                      />
                    </Field>
                  </div>

                  <Field label="允许的发送者 (allowFrom)" hint="逗号分隔的用户 ID，* 表示所有人">
                    <input
                      type="text"
                      value={dingtalk.allowFrom}
                      onChange={(e) => setDingtalk((p) => ({ ...p, allowFrom: e.target.value }))}
                      placeholder="*, 或 userId1, userId2"
                      className={inputClass}
                    />
                  </Field>

                </div>

                <SaveButton onClick={handleSaveDingtalk} />
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
