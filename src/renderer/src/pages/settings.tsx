import { useState, useEffect } from 'react'
import { Monitor, Cpu, Loader2, Save, Eye, EyeOff, Brain } from 'lucide-react'
import { useTheme } from '../components/theme-context'

interface ModelSettings {
  provider: string
  apiKey: string
  baseUrl: string
  stream?: boolean
}

interface MemorySettings {
  enabled: boolean
  extractionEnabled: boolean
}

interface SystemSettings {
  theme: 'system' | 'light' | 'dark'
  language: string
}

interface AppSettings {
  model: ModelSettings
  memory: MemorySettings
  system: SystemSettings
}

const DEFAULT_SETTINGS: AppSettings = {
  model: {
    provider: 'openai',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1'
  },
  memory: {
    enabled: true,
    extractionEnabled: true
  },
  system: {
    theme: 'system',
    language: 'zh-CN'
  }
}

export default function Settings(): React.JSX.Element {
  const { setTheme } = useTheme()
  const [activeTab, setActiveTab] = useState<'model' | 'memory' | 'system'>('model')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [originalSettings, setOriginalSettings] = useState<string>('')
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    if (!loading) {
      setHasChanges(JSON.stringify(settings) !== originalSettings)
    }
  }, [settings, originalSettings, loading])

  const loadSettings = async (): Promise<void> => {
    try {
      const content = await window.api.readConfigFile('catbot.json')
      const parsed: unknown = JSON.parse(content)
      const parsedRecord =
        typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}

      // Store complete parsed config to preserve other fields (like channels)
      const parsedModel =
        typeof parsedRecord.model === 'object' && parsedRecord.model !== null
          ? (parsedRecord.model as Record<string, unknown>)
          : {}
      const parsedSystem =
        typeof parsedRecord.system === 'object' && parsedRecord.system !== null
          ? (parsedRecord.system as Record<string, unknown>)
          : {}
      const parsedMemory =
        typeof parsedRecord.memory === 'object' && parsedRecord.memory !== null
          ? (parsedRecord.memory as Record<string, unknown>)
          : {}

      const merged: AppSettings = {
        model: { ...DEFAULT_SETTINGS.model, ...(parsedModel as Partial<ModelSettings>) },
        memory: { ...DEFAULT_SETTINGS.memory, ...(parsedMemory as Partial<MemorySettings>) },
        system: { ...DEFAULT_SETTINGS.system, ...(parsedSystem as Partial<SystemSettings>) }
      }
      setSettings(merged)
      setOriginalSettings(JSON.stringify(merged))
    } catch (error) {
      console.error('Failed to load settings:', error)
      // If file doesn't exist or is invalid, use defaults (file created by main process)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      // Read current config first to preserve other fields
      let currentConfig: Record<string, unknown> = {}
      try {
        const content = await window.api.readConfigFile('catbot.json')
        const parsed = JSON.parse(content)
        if (typeof parsed === 'object' && parsed !== null) {
          currentConfig = parsed
        }
      } catch {
        // Ignore read error, start with empty object
      }

      // Merge current settings into existing config
      const newConfig = {
        ...currentConfig,
        model: settings.model,
        memory: settings.memory,
        system: settings.system
      }

      // Artificial delay for better UX
      await Promise.all([
        window.api.writeConfigFile('catbot.json', JSON.stringify(newConfig, null, 2)),
        new Promise<void>((resolve) => setTimeout(resolve, 800))
      ])
      setOriginalSettings(JSON.stringify(settings))
      setHasChanges(false)
      // Notify other pages (e.g. chat) that settings have changed
      window.dispatchEvent(new CustomEvent('settings-updated'))
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      setSaving(false)
    }
  }

  const updateModelSetting = (key: keyof ModelSettings, value: string): void => {
    setSettings((prev) => ({
      ...prev,
      model: { ...prev.model, [key]: value }
    }))
  }

  const updateSystemTheme = (value: SystemSettings['theme']): void => {
    setSettings((prev) => ({
      ...prev,
      system: { ...prev.system, theme: value }
    }))
    setTheme(value)
  }

  const updateSystemLanguage = (value: SystemSettings['language']): void => {
    setSettings((prev) => ({
      ...prev,
      system: { ...prev.system, language: value }
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-gray-400" size={24} />
      </div>
    )
  }

  return (
    <div className="flex h-full w-full bg-gray-100 dark:bg-gray-800 gap-1">
      {/* Sidebar */}
      <div className="w-64 bg-white dark:bg-gray-900 rounded-r-lg flex flex-col border-y border-r border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
        <div className="h-11 px-4 flex items-center bg-gray-50/50 dark:bg-gray-800/50">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Settings
          </h2>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          <button
            onClick={() => setActiveTab('model')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
              activeTab === 'model'
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Cpu size={18} />
            Model Settings
          </button>
          <button
            onClick={() => setActiveTab('memory')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
              activeTab === 'memory'
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Brain size={18} />
            Memory
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
              activeTab === 'system'
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Monitor size={18} />
            System Settings
          </button>
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 bg-white dark:bg-gray-900 rounded-lg flex flex-col shadow-sm border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="p-8 max-w-3xl mx-auto space-y-8">
            {activeTab === 'model' ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Model Configuration
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Provider
                      </label>
                      <select
                        value={settings.model.provider}
                        onChange={(e) => {
                          updateModelSetting('provider', e.target.value)
                        }}
                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-transparent transition-all text-gray-900 dark:text-white"
                      >
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="google">Google Gemini</option>
                        <option value="minimax">Minimax</option>
                        <option value="ollama">Ollama</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          value={settings.model.apiKey}
                          onChange={(e) => updateModelSetting('apiKey', e.target.value)}
                          placeholder="sk-..."
                          className="w-full px-4 py-2.5 pr-10 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-transparent transition-all text-gray-900 dark:text-white placeholder-gray-400"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Base URL
                      </label>
                      <input
                        type="text"
                        value={settings.model.baseUrl}
                        onChange={(e) => updateModelSetting('baseUrl', e.target.value)}
                        placeholder="https://api.openai.com/v1"
                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-transparent transition-all text-gray-900 dark:text-white placeholder-gray-400"
                      />
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Streaming Output
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Enable streaming to see responses in real-time
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.model.stream ?? false}
                        onClick={() =>
                          setSettings((prev) => ({
                            ...prev,
                            model: { ...prev.model, stream: !prev.model.stream }
                          }))
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                          settings.model.stream
                            ? 'bg-blue-600'
                            : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            settings.model.stream ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeTab === 'memory' ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Memory System
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    Persistent memory across conversations. Uses the current chat model for
                    relevance ranking and background extraction.
                  </p>
                  <div className="space-y-5">
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Enable Memory
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Remember information across conversations
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.memory.enabled}
                        onClick={() =>
                          setSettings((prev) => ({
                            ...prev,
                            memory: { ...prev.memory, enabled: !prev.memory.enabled }
                          }))
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                          settings.memory.enabled
                            ? 'bg-blue-600'
                            : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            settings.memory.enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Background Extraction
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Auto-extract memories from conversations after each response
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.memory.extractionEnabled}
                        onClick={() =>
                          setSettings((prev) => ({
                            ...prev,
                            memory: {
                              ...prev.memory,
                              extractionEnabled: !prev.memory.extractionEnabled
                            }
                          }))
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                          settings.memory.extractionEnabled
                            ? 'bg-blue-600'
                            : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            settings.memory.extractionEnabled
                              ? 'translate-x-5'
                              : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    System Preferences
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Theme
                      </label>
                      <select
                        value={settings.system.theme}
                        onChange={(e) =>
                          updateSystemTheme(e.target.value as SystemSettings['theme'])
                        }
                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-transparent transition-all text-gray-900 dark:text-white"
                      >
                        <option value="system">Follow System</option>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Language
                      </label>
                      <select
                        value={settings.system.language}
                        onChange={(e) => updateSystemLanguage(e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-transparent transition-all text-gray-900 dark:text-white"
                      >
                        <option value="zh-CN">简体中文</option>
                        <option value="en-US">English</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-8 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-end">
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              !hasChanges && !saving
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
            }`}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
